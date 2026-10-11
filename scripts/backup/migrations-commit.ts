import { execFileSync } from 'node:child_process';

const git = (repo: string, args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' });

/** Versions (numeric prefixes) of supabase/migrations at a commit, sorted. */
export function migrationVersions(repo: string, commit: string): string[] {
	return git(repo, ['ls-tree', '--name-only', commit, 'supabase/migrations/'])
		.split('\n')
		.map((path) => /\/(\d+)_[^/]*\.sql$/.exec(path)?.[1])
		.filter((v): v is string => Boolean(v))
		.sort();
}

/**
 * Newest commit of `ref` whose supabase/migrations holds exactly `versions`: the schema to
 * prepare before restoring an export (spec, decision 9). Null when none matches.
 */
export function findMigrationsCommit(repo: string, ref: string, versions: readonly string[]): string | null {
	const want = [...versions].sort().join(',');
	const commits = git(repo, ['rev-list', ref, '--', 'supabase/migrations']).split('\n').filter(Boolean);
	return commits.find((commit) => migrationVersions(repo, commit).join(',') === want) ?? null;
}
