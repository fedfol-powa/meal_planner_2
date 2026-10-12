// The guard runs in the Vitest config, before the global setup: with a remote TEST_DATABASE_URL a whole
// Vitest run reaches nothing (review of PR #34, finding 2). Each config is started with the real CLI.
import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { assertLocalTestDatabase } from './local-database.ts';

const run = promisify(execFile);
const REMOTE = 'postgresql://postgres:s3cret@remote.invalid:5432/postgres';

describe('assertLocalTestDatabase', () => {
	it('accepts no database and the local stack, refuses anything else without the password', () => {
		expect(() => assertLocalTestDatabase({})).not.toThrow();
		expect(() => assertLocalTestDatabase({ TEST_DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' })).not.toThrow();
		expect(() => assertLocalTestDatabase({ TEST_DATABASE_URL: 'postgresql://postgres:postgres@localhost:54322/postgres' })).not.toThrow();
		for (const url of [REMOTE, 'postgresql://postgres:s3cret@127.0.0.1%2Cremote.invalid:5432/postgres', 'postgresql://postgres:s3cret@127.0.0.1,remote.invalid:5432/postgres', 'postgresql://app_server:s3cret@127.0.0.1:54322/postgres']) {
			let message = '';
			try {
				assertLocalTestDatabase({ TEST_DATABASE_URL: url });
			} catch (error) {
				message = String(error);
			}
			expect(message, url).toContain('TEST_DATABASE_URL is not the local stack');
			expect(message).not.toContain('s3cret');
		}
	});
});

describe('every config that prepares the database stops a remote TEST_DATABASE_URL before any connection', () => {
	const configs: [string, string][] = [
		['.', 'vitest.config.ts'],
		['.', 'vitest.destructive.config.ts'],
		['server', 'vitest.config.ts'],
		['server', 'vitest.drill.config.ts'],
	];
	for (const [dir, config] of configs)
		it(`${dir}/${config}`, { timeout: 60_000 }, async () => {
			const probe = join(mkdtempSync(join(tmpdir(), 'probe-')), 'calls');
			const env = { ...process.env, TEST_DATABASE_URL: REMOTE, DESTRUCTIVE_TESTS: '1', CI: '', PROBE_FILE: probe,
				NODE_OPTIONS: `--import ${resolve('scripts/test-support/connect-probe.mjs')}` };
			const result = await run('npx', ['vitest', 'run', '-c', config], { cwd: resolve(dir), env }).then(
				(r) => ({ code: 0, out: r.stdout + r.stderr }),
				(e: { code: number; stdout: string; stderr: string }) => ({ code: e.code, out: e.stdout + e.stderr }),
			);
			expect(result.code).not.toBe(0);
			expect(result.out).toContain('TEST_DATABASE_URL is not the local stack');
			expect(result.out).not.toContain('s3cret');
			const calls = existsSync(probe) ? readFileSync(probe, 'utf8') : '';
			expect(calls).not.toContain('remote.invalid');
			expect(calls).not.toContain(':5432');
		});
});
