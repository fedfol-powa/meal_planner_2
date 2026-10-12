import { describe, expect, it } from 'vitest';
import { localDatabaseUrl } from './destructive/support.ts';

// The destructive suite empties schema app: it must never reach a database that is not the local stack.
describe('localDatabaseUrl', () => {
	it('accepts the local stack only', () => {
		expect(localDatabaseUrl('postgresql://postgres:postgres@127.0.0.1:54322/postgres')).toBe('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
		for (const url of [
			'postgresql://postgres.lronuqvtjdhfyychnscr:pw@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=verify-full',
			'postgresql://postgres:postgres@db.example.com:5432/postgres',
			undefined,
		])
			expect(() => localDatabaseUrl(url)).toThrow(/local/);
	});
});
