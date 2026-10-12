// command.test.ts: argument parsing, and the real command run with node (strip-only TypeScript).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ORPCError } from '@orpc/server';
import { describe, expect, it } from 'vitest';
import { describeError, finishLoad, parseLoadArgs } from '../load.ts';
import { emptyFamilyResult } from './family.ts';
import { LoadStepError, type LoadResult } from './run.ts';
import { command } from './test-command.ts';
import { writeOriginFixture } from './test-origin.ts';

const uuid = '7b3c8a52-5d0e-4f43-9a51-6c1f0e2a9b10';
const base = ['--credentials', '/x.env', '--today', '2026-10-13', '--family', uuid, '--curator', uuid];

describe('parseLoadArgs', () => {
	it('reads a dry run and a confirmed load, never a load without one of the two', () => {
		expect(parseLoadArgs([...base, '--dry-run'])).toMatchObject({ mode: 'load', dryRun: true, local: false });
		expect(parseLoadArgs([...base, '--confirm', 'abcd1234abcd1234'])).toMatchObject({ dryRun: false, confirm: 'abcd1234abcd1234' });
		expect(() => parseLoadArgs(base)).toThrow(/--dry-run or --confirm/);
		expect(() => parseLoadArgs([...base, '--dry-run', '--confirm', 'x'])).toThrow(/--dry-run or --confirm/);
	});
	it('requires the arguments and refuses unknown options', () => {
		expect(() => parseLoadArgs(['--credentials', '/x', '--family', uuid, '--curator', uuid, '--dry-run'])).toThrow(/--today/);
		expect(() => parseLoadArgs([...base, '--curator', 'fede@example.com', '--dry-run'])).toThrow(/uuid/);
		expect(() => parseLoadArgs([...base, '--dryrun'])).toThrow();
	});
	it('reads a launch load from a baseline of 32 hex characters only', () => {
		expect(parseLoadArgs([...base, '--launch-from', 'a'.repeat(32), '--dry-run'])).toMatchObject({ launchFrom: 'a'.repeat(32) });
		expect(() => parseLoadArgs([...base, '--launch-from', 'xyz', '--dry-run'])).toThrow(/--launch-from/);
	});
	it('reads --check-connection alone', () => {
		expect(parseLoadArgs(['--credentials', '/x', '--check-connection', '--local'])).toMatchObject({ mode: 'check', local: true });
	});
	it('names the credentials --credentials: --env-file is an option of Node', () => {
		expect(() => parseLoadArgs(['--env-file', '/x', '--check-connection'])).toThrow(/--credentials/);
	});
});

describe('describeError', () => {
	it('says the step and the codes, never a value', () => {
		const domain = new LoadStepError('recipes: createDraft pasta-al-forno', new ORPCError('invalid', { data: { issues: [{ path: ['content', 'title'], code: 'too_small' }] }, message: 'secret value' }));
		expect(describeError(domain)).toBe('failed at recipes: createDraft pasta-al-forno: invalid (content.title too_small)');
		const pg = Object.assign(new Error('duplicate key value (slug)=(secret)'), { name: 'PostgresError', code: '23505' });
		expect(describeError(new LoadStepError('ingredients: farina', pg))).toBe('failed at ingredients: farina: PostgresError 23505');
		expect(describeError(new LoadStepError('x', pg))).not.toContain('secret');
	});
});

describe('finishLoad', () => {
	const written: LoadResult = {
		mode: 'written', importReport: '', baseline: 'b'.repeat(32), family: emptyFamilyResult(),
		catalogue: { books: { created: 0, present: 0 }, ingredients: { created: 0, present: 0 }, equivalences: { created: 0, present: 0, diverging: [] }, recipes: { published: 0, drafts: 0, present: 0 }, publicationBlocked: [] },
	};
	it('prints the new launch baseline first; a report that cannot be written is exit 3 with the data written (review of PR #34, finding 9)', () => {
		const lines: string[] = [];
		const code = finishLoad(written, { inputs: 'i', endpoint: 'e', dryRun: false }, { log: (l) => lines.push(l), writeReport: () => { throw Object.assign(new Error('no space'), { code: 'ENOSPC' }); } });
		expect(code).toBe(3);
		expect(lines[0]).toBe(`Committed. Launch baseline after the load: ${'b'.repeat(32)} (write it in the coordination log; it replaces the previous one)`);
		expect(lines.at(-1)).toBe(`data written, launch baseline B1 = ${'b'.repeat(32)}; the report could not be written: ENOSPC`);
	});
	it('exits 0 when the report is written, and says when a load is not a launch load', () => {
		const lines: string[] = [];
		expect(finishLoad({ ...written, baseline: null }, { inputs: 'i', endpoint: 'e', dryRun: false }, { log: (l) => lines.push(l), writeReport: () => {} })).toBe(0);
		expect(lines[0]).toBe('Committed. No launch baseline: not a launch load');
	});
});

describe('the real command', () => {
	it('starts with node and refuses another project without echoing the password', async () => {
		const r = await command(['--credentials', '<env>', '--check-connection'],
			'APP_SERVER_DATABASE_URL=postgresql://app_server.abcdefghijklmnopqrst:s3cr%40t@x.pooler.supabase.com:5432/postgres?sslmode=verify-full\n');
		expect(r.code).toBe(1);
		expect(r.out).toMatch(/the user is not app_server\.lronuqvtjdhfyychnscr/);
		expect(r.out).not.toContain('s3cr');
	});
	it('refuses a confirmation that does not match the inputs, before connecting', async () => {
		// Port 1 is closed: reaching it would give a connection error, not this refusal.
		const r = await command(['--credentials', '<env>', ...base.slice(2), '--confirm', '0000000000000000', '--local'],
			'POSTGRES_DATABASE_URL=postgresql://postgres:s3cr3t@127.0.0.1:1/postgres\n',
			// An origin of its own: CI has no ../meal_planner.
			{ MEAL_PLANNER_ORIGIN: writeOriginFixture().dir });
		expect(r.code).toBe(1);
		expect(r.out).toContain('inputs changed since the preview');
		expect(r.out).not.toContain('s3cr3t');
	});
	it('refuses a checkout with local changes on the production target, before connecting', async () => {
		// git reads GIT_DIR and GIT_WORK_TREE: the command sees a repository with an uncommitted change.
		const repo = mkdtempSync(join(tmpdir(), 'load-dirty-'));
		const git = (...args: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: repo });
		git('init', '-q');
		writeFileSync(join(repo, 'f'), 'a');
		git('add', 'f');
		git('commit', '-qm', 'x');
		writeFileSync(join(repo, 'f'), 'b');
		const ca = join(repo, 'ca.crt');
		writeFileSync(ca, 'CA');
		const r = await command(['--credentials', '<env>', ...base.slice(2), '--dry-run'],
			`POSTGRES_DATABASE_URL=postgresql://postgres.lronuqvtjdhfyychnscr:s3cr3t@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=verify-full&sslrootcert=${ca}\n`,
			{ GIT_DIR: join(repo, '.git'), GIT_WORK_TREE: repo, MEAL_PLANNER_ORIGIN: writeOriginFixture().dir });
		expect(r.code).toBe(1);
		expect(r.out).toContain('the checkout is not clean');
		expect(r.out).not.toContain('s3cr3t');
	});
});
