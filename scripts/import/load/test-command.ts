// The load command run with the real node binary (strip-only TypeScript), shared by the tests.
import { execFile } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** `<env>` in args becomes a temporary credentials file holding `env`; `vars` extends the process environment. */
export async function command(args: string[], env: string, vars: Record<string, string> = {}) {
	const file = join(mkdtempSync(join(tmpdir(), 'load-cmd-')), 'test.env');
	writeFileSync(file, env);
	try {
		const { stdout, stderr } = await run(process.execPath, ['scripts/import/load.ts', ...args.map((a) => (a === '<env>' ? file : a))], { env: { ...process.env, ...vars } });
		return { code: 0, out: stdout + stderr };
	} catch (error) {
		const e = error as { code: number; stdout: string; stderr: string };
		return { code: e.code, out: e.stdout + e.stderr };
	}
}
