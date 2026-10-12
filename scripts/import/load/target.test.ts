import postgres from 'postgres';
import { describe, expect, it } from 'vitest';
import { checkTarget, clientOptions, connect, dbUrlWithoutPassword, describeEndpoint, productionRef, psqlConninfo } from './target.ts';

const ref = 'lronuqvtjdhfyychnscr';
const host = 'aws-0-eu-central-1.pooler.supabase.com';
const tls = 'sslmode=verify-full&sslrootcert=/ca.crt';
const prod = (user = `app_server.${ref}`, query = tls, rest = `${host}:5432/postgres`) =>
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
	it('accepts the session pooler and returns the fields the connections are built from', () => {
		const checked = checkTarget('V', prod(), opts);
		expect(describeEndpoint(checked.endpoint)).toBe(`app_server.${ref}@${host}:5432/postgres`);
		expect(checked.fields).toEqual({ host, port: 5432, database: 'postgres', user: `app_server.${ref}`, password: 's3cr@t!', caPath: '/ca.crt' });
		expect(checked.ssl).toEqual({ rejectUnauthorized: true, ca: 'CA', servername: host });
	});
	it('refuses a missing or unparsable variable without echoing it', () => {
		expect(fails(undefined)).toContain('V is not set');
		expect(fails('not a url s3cr')).toContain('V is not a valid connection string');
	});
	it('refuses another project, another role, another host, port or database', () => {
		expect(fails(prod(`app_server.abcdefghijklmnopqrst`))).toMatch(/not app_server\.lronuqvtjdhfyychnscr/);
		expect(fails(prod(`postgres.${ref}`))).toMatch(/not app_server/);
		expect(fails(prod(undefined, tls, 'db.lronuqvtjdhfyychnscr.supabase.co:5432/postgres'))).toMatch(/pooler/);
		expect(fails(prod(undefined, tls, `${host}:6543/postgres`))).toMatch(/port/);
		expect(fails(prod(undefined, tls, `${host}:5432/other`))).toMatch(/database/);
	});
	it('refuses encodings, lists and anything but one canonical DNS name (review of PR #34, finding 3)', () => {
		// Postgres.js decodes %2C into two hosts: the first one is not the pooler.
		expect(fails(prod(undefined, tls, `db.example.com%2C${host}:5432/postgres`))).toMatch(/encoded/);
		expect(fails(prod(undefined, tls, `db.example.com,${host}:5432/postgres`))).toMatch(/host|valid/);
		expect(fails(prod(undefined, tls, `AWS-0-eu-central-1.pooler.supabase.com:5432/postgres`))).toMatch(/host/);
		expect(fails(prod(undefined, tls, `[::1]:5432/postgres`))).toMatch(/host/);
		expect(fails(prod(`app_server%2E${ref}`))).toMatch(/user|encoded/);
		expect(fails(prod(undefined, tls, `${host}:5432/post%67res`))).toMatch(/database|encoded/);
		expect(fails(prod(undefined, 'sslmode=verify-full&sslrootcert=/a%2Cb'))).toMatch(/encoded/);
		expect(fails(prod(undefined, `${tls}&sslmode=verify-full`))).toMatch(/parameter/);
	});
	it('refuses a remote url without verified TLS or with parameters that contradict the check', () => {
		expect(fails(prod(undefined, ''))).toMatch(/tls/);
		expect(fails(prod(undefined, 'sslmode=require&sslrootcert=/ca.crt'))).toMatch(/tls/);
		expect(fails(prod(undefined, 'sslmode=verify-full'))).toMatch(/sslrootcert/);
		expect(fails(prod(undefined, `${tls}&ssl=false`))).toMatch(/parameter/);
		expect(fails(prod(undefined, `${tls}&options=-c role=postgres`))).toMatch(/parameter|encoded/);
		expect(fails(prod(undefined, `${tls}&target_session_attrs=any`))).toMatch(/parameter/);
		expect(fails(prod(), { ...opts, readCa: () => { throw new Error('no'); } })).toMatch(/sslrootcert/);
	});
	it('accepts only local hosts without TLS parameters with --local', () => {
		const local = { ...opts, target: 'local' as const };
		const checked = checkTarget('V', 'postgresql://app_server:x@localhost:54322/postgres', local);
		expect(checked.ssl).toBe(false);
		expect(checked.fields).toMatchObject({ host: 'localhost', port: 54322, password: 'x' });
		expect(fails(prod(), local)).toMatch(/not local/);
		expect(fails('postgresql://app_server:x@127.0.0.1:54322/postgres?sslmode=disable', local)).toMatch(/parameter/);
	});
});

describe('the clients get the checked fields, never the url', () => {
	const checked = () => checkTarget('V', prod(), opts);
	it('Postgres.js resolves exactly the shown destination', async () => {
		const sql = connect(checked());
		try {
			expect(sql.options.host).toEqual([host]);
			expect(sql.options.port).toEqual([5432]);
			expect(sql.options.database).toBe('postgres');
			expect(sql.options.user).toBe(`app_server.${ref}`);
			expect(sql.options.ssl).toEqual({ rejectUnauthorized: true, ca: 'CA', servername: host });
		} finally {
			await sql.end();
		}
		expect(clientOptions(checked())).toMatchObject({ max: 1, fetch_types: false });
	});
	it('the url form, decoded by Postgres.js, would have been two hosts: the reason for the fields', async () => {
		const sql = postgres(`postgresql://u:p@db.example.com%2C${host}:5432/postgres`);
		expect(sql.options.host).toEqual(['db.example.com', host]);
		await sql.end();
	});
	it('psql and the Supabase CLI get the destination without the password', () => {
		expect(psqlConninfo(checked())).toBe(`host=${host} port=5432 dbname=postgres user=app_server.${ref} sslmode=verify-full sslrootcert=/ca.crt`);
		const local = checkTarget('V', 'postgresql://postgres:pw@127.0.0.1:54322/postgres', { ...opts, role: 'postgres', target: 'local' });
		expect(psqlConninfo(local)).toBe('host=127.0.0.1 port=54322 dbname=postgres user=postgres sslmode=disable');
		const url = dbUrlWithoutPassword(checked());
		expect(url).toBe(`postgresql://app_server.${ref}@${host}:5432/postgres?sslmode=verify-full&sslrootcert=%2Fca.crt`);
		expect(url).not.toContain('s3cr');
	});
});
