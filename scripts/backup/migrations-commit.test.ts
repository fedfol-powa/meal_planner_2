import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findMigrationsCommit, migrationVersions } from './migrations-commit.ts';

describe('commit of the migrations of an export', () => {
	let repo: string;
	const commits: string[] = [];
	const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();

	beforeAll(async () => {
		repo = await mkdtemp(join(tmpdir(), 'migrations-'));
		git('init', '-q', '-b', 'main');
		git('config', 'user.email', 'test@example.com');
		git('config', 'user.name', 'Test');
		await mkdir(join(repo, 'supabase', 'migrations'), { recursive: true });
		await writeFile(join(repo, 'supabase', 'migrations', '20260101000000_first.sql'), 'select 1;');
		git('add', '.');
		git('commit', '-q', '-m', 'first');
		commits.push(git('rev-parse', 'HEAD'));
		await writeFile(join(repo, 'README.md'), 'not a migration');
		git('add', '.');
		git('commit', '-q', '-m', 'docs');
		await writeFile(join(repo, 'supabase', 'migrations', '20260201000000_second.sql'), 'select 2;');
		git('add', '.');
		git('commit', '-q', '-m', 'second');
		commits.push(git('rev-parse', 'HEAD'));
	});
	afterAll(() => rm(repo, { recursive: true }));

	it('lists the versions of a commit', () => {
		expect(migrationVersions(repo, commits[1])).toEqual(['20260101000000', '20260201000000']);
	});

	it('finds the commit of an archive older than the last migration', () => {
		expect(findMigrationsCommit(repo, 'main', ['20260101000000'])).toBe(commits[0]);
		expect(findMigrationsCommit(repo, 'main', ['20260201000000', '20260101000000'])).toBe(commits[1]);
		expect(findMigrationsCommit(repo, 'main', ['20990101000000'])).toBeNull();
	});
});
