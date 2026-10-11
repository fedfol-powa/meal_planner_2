import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { encodeExport, importKey } from '../../server/src/backup/format.ts';
import { DestinationError, destinationOf, parseCommand, UsageError } from './cli.ts';

describe('command line of the restore CLI', () => {
	it('reads the valid forms', () => {
		expect(parseCommand(['inspect', 'export.bin'])).toEqual({ command: 'inspect', file: 'export.bin', ref: 'origin/main' });
		expect(parseCommand(['inspect', 'export.bin', '--ref', 'abc123'])).toEqual({ command: 'inspect', file: 'export.bin', ref: 'abc123' });
		expect(parseCommand(['inspect', '--ref=abc123', 'export.bin'])).toEqual({ command: 'inspect', file: 'export.bin', ref: 'abc123' });
		expect(parseCommand(['restore', 'export.bin'])).toEqual({ command: 'restore', file: 'export.bin', dryRun: false, acceptUnknownMigrations: false });
		expect(parseCommand(['restore', 'export.bin', '--dry-run', '--accept-unknown-migrations'])).toEqual({
			command: 'restore', file: 'export.bin', dryRun: true, acceptUnknownMigrations: true,
		});
	});

	it.each([
		[[]],
		[['restor', 'export.bin']],
		[['restore']],
		[['restore', 'export.bin', 'other.bin']],
		[['restore', 'export.bin', '--dry-run=true']],
		[['restore', 'export.bin', '--dry-run=false']],
		[['restore', 'export.bin', '--dryrun']],
		[['restore', 'export.bin', '--no-dry-run']],
		[['restore', 'export.bin', '-n']],
		[['restore', 'export.bin', '--ref', 'abc123']],
		[['inspect', 'export.bin', '--dry-run']],
		[['inspect', 'export.bin', '--ref']],
		[['inspect', 'export.bin', '--ref', '']],
		[['inspect', 'export.bin', '--ref=']],
		[['inspect', 'export.bin', '--ref', '--dry-run']],
		[['inspect', 'export.bin', '--ref=-x']],
	])('refuses %j', (argv) => {
		expect(() => parseCommand(argv)).toThrow(UsageError);
	});
});

describe('destination of the restore', () => {
	const noCa = () => {
		throw new Error('unexpected read');
	};

	it('exempts only the local stack without TLS parameters', () => {
		for (const host of ['127.0.0.1', 'localhost', '[::1]']) {
			expect(destinationOf(`postgresql://postgres@${host}:54322/postgres`, noCa)).toEqual({
				url: `postgresql://postgres@${host}:54322/postgres`, ssl: false,
			});
		}
	});

	it.each([
		'postgresql://postgres@db.example.supabase.co:5432/postgres',
		'postgresql://postgres@db.example.supabase.co:5432/postgres?sslmode=disable',
		'postgresql://postgres@db.example.supabase.co:5432/postgres?sslmode=prefer',
		'postgresql://postgres@db.example.supabase.co:5432/postgres?sslmode=require',
		'postgresql://postgres@db.example.supabase.co:5432/postgres?sslmode=verify-ca',
		'postgresql://postgres@db.example.supabase.co:5432/postgres?sslrootcert=system',
		'postgresql://postgres@127.0.0.2:5432/postgres',
		'postgresql://postgres@127.0.0.1:5432/postgres?sslmode=require',
	])('refuses a remote or unverified destination: %s', (url) => {
		expect(() => destinationOf(url, noCa)).toThrow(new DestinationError('tls_required'));
	});

	it.each([
		['not a url', 'url'],
		['mysql://root@127.0.0.1/app', 'url'],
		['postgresql:///postgres', 'host'],
		['postgresql://postgres@a.example,b.example/postgres?sslmode=verify-full', 'host'],
		['postgresql://postgres@db.example/postgres?sslmode=verify-full&ssl=false', 'ssl_parameter'],
	])('refuses a malformed destination: %s', (url, reason) => {
		expect(() => destinationOf(url, noCa)).toThrow(new DestinationError(reason));
	});

	it('verifies the certificate against the system store or the given CA', () => {
		expect(destinationOf('postgresql://postgres@db.example:5432/postgres?sslmode=verify-full', noCa)).toEqual({
			url: 'postgresql://postgres@db.example:5432/postgres', ssl: { rejectUnauthorized: true },
		});
		expect(destinationOf('postgresql://postgres@db.example:5432/postgres?sslmode=verify-full&sslrootcert=system', noCa)).toEqual({
			url: 'postgresql://postgres@db.example:5432/postgres', ssl: { rejectUnauthorized: true },
		});
		const read: string[] = [];
		const destination = destinationOf('postgresql://postgres@db.example:5432/postgres?sslmode=verify-full&sslrootcert=%2Ftmp%2Fca.crt', (path) => {
			read.push(path);
			return 'PEM';
		});
		expect(read).toEqual(['/tmp/ca.crt']);
		expect(destination).toEqual({ url: 'postgresql://postgres@db.example:5432/postgres', ssl: { rejectUnauthorized: true, ca: 'PEM' } });
	});

	it('refuses a CA file that cannot be read', () => {
		expect(() => destinationOf('postgresql://postgres@db.example/postgres?sslmode=verify-full&sslrootcert=missing.crt', noCa))
			.toThrow(new DestinationError('sslrootcert'));
	});
});

describe('restore CLI refuses before connecting', () => {
	const run = promisify(execFile);
	const cli = join(import.meta.dirname, 'restore.ts');
	let server: Server;
	let port: number;
	let connections = 0;
	/** What the client sends after the 8 bytes of the SSLRequest. */
	let afterSslRequest = Buffer.alloc(0);

	beforeAll(async () => {
		server = createServer((socket) => {
			connections++;
			let received = Buffer.alloc(0);
			socket.on('data', (chunk: Buffer) => {
				if (received.length === 0) socket.write('N'); // a server without TLS
				received = Buffer.concat([received, chunk]);
				afterSslRequest = received.subarray(8);
			});
			socket.on('error', () => {});
			setTimeout(() => socket.destroy(), 500);
		});
		await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
		port = (server.address() as { port: number }).port;
	});
	afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

	const cliRun = async (args: string[], databaseUrl: string, key = '') => {
		const env = { ...process.env, DATABASE_URL: databaseUrl, BACKUP_ENCRYPTION_KEY: key, PGPASSWORD: 'secret' };
		try {
			const { stdout, stderr } = await run(process.execPath, [cli, ...args], { env });
			return { code: 0, out: stdout + stderr };
		} catch (error) {
			const e = error as { code: number; stdout: string; stderr: string };
			return { code: e.code, out: e.stdout + e.stderr };
		}
	};

	it.each([
		[['restore', 'missing.bin', '--dry-run=true']],
		[['restore', 'missing.bin', '--dryrun']],
		[['restore', 'missing.bin', '--dry-run', 'extra']],
		[['inspect', 'missing.bin', '--ref']],
	])('exits with 2 on %j', async (args) => {
		const result = await cliRun(args, `postgresql://postgres@127.0.0.1:${port}/postgres`);
		expect(result.code).toBe(2);
		expect(result.out).toContain('usage:');
		expect(connections).toBe(0);
	});

	it('refuses a remote destination without verified TLS, before the file and the connection', async () => {
		const result = await cliRun(['restore', 'missing.bin', '--dry-run'], 'postgresql://postgres@db.invalid:5432/postgres?sslmode=require');
		expect(result).toEqual({ code: 1, out: 'refused: destination tls_required\n' });
		expect(connections).toBe(0);
	});

	it('with verify-full never sends the export in clear to a server without TLS', async () => {
		const key = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
		const dir = await mkdtemp(join(tmpdir(), 'restore-cli-'));
		try {
			const { blob } = await encodeExport(['{"format":"sentinel"}'], await importKey(key), 'k1');
			const file = join(dir, 'export.bin');
			await writeFile(file, new Uint8Array(await blob.arrayBuffer()));
			const result = await cliRun(['restore', file, '--dry-run'], `postgresql://postgres@127.0.0.1:${port}/postgres?sslmode=verify-full`, `k1=${key}`);
			expect(result.code).toBe(1);
			expect(result.out).toMatch(/^failed: /);
			expect(connections).toBe(1);
			// Only a TLS handshake record, never the startup message with the user or any query.
			expect(afterSslRequest[0]).toBe(0x16);
			expect(afterSslRequest.includes('postgres')).toBe(false);
			expect(afterSslRequest.includes('sentinel')).toBe(false);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});
