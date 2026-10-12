import { describe, expect, it } from 'vitest';
import { checkTarget, clientOptions, connect, describeEndpoint, productionRef } from './target.ts';

const ref = 'lronuqvtjdhfyychnscr';
const tls = 'sslmode=verify-full&sslrootcert=/ca.crt';
const prod = (user = `app_server.${ref}`, query = tls, rest = 'aws-0-eu-central-1.pooler.supabase.com:5432/postgres') =>
	`postgresql://${user}:s3cr%40t!@${rest}?${query}`;
const opts = { role: 'app_server' as const, target: 'production' as const, ref, readCa: () => 'CA' };
const fails = (url: string | undefined, o: Parameters<typeof checkTarget>[2] = opts) => {
	try { checkTarget('V', url, o); } catch (e) { expect(String(e)).not.toContain('s3cr'); return String(e); }
	throw new Error('accepted');
};

describe('checkTarget', () => {
	it('reads the ref from the versioned file', () => {
		expect(productionRef(process.cwd())).toBe(ref);
	});
	it('accepts the session pooler with the expected role, ref, port, database and verified TLS', () => {
		const { endpoint, destination } = checkTarget('V', prod(), opts);
		expect(describeEndpoint(endpoint)).toBe(`app_server.${ref}@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`);
		expect(destination.ssl).toEqual({ rejectUnauthorized: true, ca: 'CA' });
		expect(destination.url).not.toContain('sslmode');
	});
	it('refuses a missing or unparsable variable without echoing it', () => {
		expect(fails(undefined)).toContain('V is not set');
		expect(fails('not a url s3cr')).toContain('V is not a valid connection string');
	});
	it('refuses another project, another role, another host, port or database', () => {
		expect(fails(prod(`app_server.abcdefghijklmnopqrst`))).toMatch(/not app_server\.lronuqvtjdhfyychnscr/);
		expect(fails(prod(`postgres.${ref}`))).toMatch(/not app_server/);
		expect(fails(prod(undefined, tls, 'db.lronuqvtjdhfyychnscr.supabase.co:5432/postgres'))).toMatch(/pooler/);
		expect(fails(prod(undefined, tls, 'aws-0-eu-central-1.pooler.supabase.com:6543/postgres'))).toMatch(/port/);
		expect(fails(prod(undefined, tls, 'aws-0-eu-central-1.pooler.supabase.com:5432/other'))).toMatch(/database/);
	});
	it('refuses a remote url without verified TLS or with parameters that contradict the check', () => {
		expect(fails(prod(undefined, ''))).toMatch(/tls_required/);
		expect(fails(prod(undefined, 'sslmode=require'))).toMatch(/tls_required/);
		expect(fails(prod(undefined, `${tls}&ssl=false`))).toMatch(/parameter/);
		expect(fails(prod(undefined, `${tls}&options=-c%20role%3Dpostgres`))).toMatch(/parameter/);
		expect(fails(prod(undefined, `${tls}&sslmode=disable`))).toMatch(/parameter/);
	});
	it('accepts only local hosts without TLS parameters with --local', () => {
		const local = { ...opts, target: 'local' as const };
		expect(checkTarget('V', 'postgresql://app_server:x@localhost:54322/postgres', local).destination.ssl).toBe(false);
		expect(fails(prod(), local)).toMatch(/not local/);
		expect(fails('postgresql://app_server:x@127.0.0.1:54322/postgres?sslmode=disable', local)).toMatch(/parameter/);
	});
});

describe('client options', () => {
	it('passes the verified TLS options to Postgres.js, and none for the local stack', () => {
		const remote = checkTarget('V', prod(), opts).destination;
		expect(clientOptions(remote)).toMatchObject({ max: 1, ssl: { rejectUnauthorized: true, ca: 'CA' } });
		let seen: unknown[] = [];
		connect(remote, ((...args: unknown[]) => { seen = args; return {} as never; }) as never);
		expect(seen[0]).toBe(remote.url);
		expect(seen[1]).toMatchObject({ ssl: { rejectUnauthorized: true, ca: 'CA' } });
	});
});
