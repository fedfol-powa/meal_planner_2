import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

// --no-index: the rules alone decide, and the paths need not exist. Nothing is created or removed.
const ignored = (path: string) => {
	try {
		execFileSync('git', ['check-ignore', '--no-index', '-q', path]);
		return true;
	} catch {
		return false;
	}
};

describe('.gitignore', () => {
	it('keeps credentials out and lets the public build values in', () => {
		expect(ignored('.env.production.local')).toBe(true);
		expect(ignored('web/.env.production.local')).toBe(true);
		expect(ignored('web/.env.local')).toBe(true);
		expect(ignored('web/.env.production')).toBe(false);
	});
});
