// command.test.ts: argument parsing, and the real command run with node (strip-only TypeScript).
import { describe, expect, it } from 'vitest';
import { parseLoadArgs } from '../load.ts';
import { command } from './test-command.ts';
import { writeOriginFixture } from './test-origin.ts';

const uuid = '7b3c8a52-5d0e-4f43-9a51-6c1f0e2a9b10';
const base = ['--env-file', '/x.env', '--today', '2026-10-13', '--family', uuid, '--curator', uuid];

describe('parseLoadArgs', () => {
	it('reads a dry run and a confirmed load, never a load without one of the two', () => {
		expect(parseLoadArgs([...base, '--dry-run'])).toMatchObject({ mode: 'load', dryRun: true, local: false });
		expect(parseLoadArgs([...base, '--confirm', 'abcd1234abcd1234'])).toMatchObject({ dryRun: false, confirm: 'abcd1234abcd1234' });
		expect(() => parseLoadArgs(base)).toThrow(/--dry-run or --confirm/);
		expect(() => parseLoadArgs([...base, '--dry-run', '--confirm', 'x'])).toThrow(/--dry-run or --confirm/);
	});
	it('requires the arguments and refuses unknown options', () => {
		expect(() => parseLoadArgs(['--env-file', '/x', '--family', uuid, '--curator', uuid, '--dry-run'])).toThrow(/--today/);
		expect(() => parseLoadArgs([...base, '--curator', 'fede@example.com', '--dry-run'])).toThrow(/uuid/);
		expect(() => parseLoadArgs([...base, '--dryrun'])).toThrow();
	});
	it('reads a launch load from a baseline of 32 hex characters only', () => {
		expect(parseLoadArgs([...base, '--launch-from', 'a'.repeat(32), '--dry-run'])).toMatchObject({ launchFrom: 'a'.repeat(32) });
		expect(() => parseLoadArgs([...base, '--launch-from', 'xyz', '--dry-run'])).toThrow(/--launch-from/);
	});
	it('reads --check-connection alone', () => {
		expect(parseLoadArgs(['--env-file', '/x', '--check-connection', '--local'])).toMatchObject({ mode: 'check', local: true });
	});
});

describe('the real command', () => {
	it('starts with node and refuses another project without echoing the password', async () => {
		const r = await command(['--env-file', '<env>', '--check-connection'],
			'APP_SERVER_DATABASE_URL=postgresql://app_server.abcdefghijklmnopqrst:s3cr%40t@x.pooler.supabase.com:5432/postgres?sslmode=verify-full\n');
		expect(r.code).toBe(1);
		expect(r.out).toMatch(/the user is not app_server\.lronuqvtjdhfyychnscr/);
		expect(r.out).not.toContain('s3cr');
	});
	it('refuses a confirmation that does not match the inputs, before connecting', async () => {
		// Port 1 is closed: reaching it would give a connection error, not this refusal.
		const r = await command(['--env-file', '<env>', ...base.slice(2), '--confirm', '0000000000000000', '--local'],
			'POSTGRES_DATABASE_URL=postgresql://postgres:s3cr3t@127.0.0.1:1/postgres\n',
			// An origin of its own: CI has no ../meal_planner.
			{ MEAL_PLANNER_ORIGIN: writeOriginFixture().dir });
		expect(r.code).toBe(1);
		expect(r.out).toContain('inputs changed since the preview');
		expect(r.out).not.toContain('s3cr3t');
	});
});
