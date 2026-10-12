// Phase 1 order on a database without the application roles (runbook R4–R6): migrations first, then the
// app_server password, then --check-connection. Drops schema app and the app roles of the local stack and
// rebuilds them with the real CLI: the very last step of CI (FRESH_DATABASE=1).
import { execFile } from 'node:child_process';
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrationCommand } from '../../release.ts';
import { databaseUrl, enabled } from '../support.ts';

const run = promisify(execFile);
const APP_ROLES = ['app_server', 'app_job', 'app_backup'];

async function runCommand(cmd: string, args: string[], env: Record<string, string> = {}) {
	try {
		// The CLI of the developer's machine lives in ~/.local/bin; CI puts it on the PATH.
		const { stdout, stderr } = await run(cmd, args, { env: { ...process.env, PATH: `${join(homedir(), '.local/bin')}:${process.env.PATH}`, ...env }, maxBuffer: 16 * 1024 * 1024 });
		return { code: 0, out: stdout + stderr };
	} catch (error) {
		const e = error as { code: number; stdout: string; stderr: string };
		return { code: typeof e.code === 'number' ? e.code : 1, out: (e.stdout ?? '') + (e.stderr ?? '') };
	}
}

describe.skipIf(!enabled || !process.env.FRESH_DATABASE)('phase 1 order on a database without the application roles', () => {
	let admin: postgres.Sql;
	let superuser: postgres.Sql;
	beforeAll(() => {
		admin = postgres(databaseUrl, { max: 1, onnotice: () => {} });
		// Only to undo what the migrations made (drop owned by needs more than postgres has locally): a new
		// project simply never had it. Same password as postgres on the local stack.
		const url = new URL(databaseUrl);
		url.username = 'supabase_admin';
		superuser = postgres(url.toString(), { max: 1, onnotice: () => {} });
	});
	afterAll(async () => {
		await admin?.end();
		await superuser?.end();
	});

	it('migrations first, then the app_server password, then --check-connection', async () => {
		// 1. Like a new project: no schema app, no application roles, no migration history.
		// pg_cron finds a job by name only for its owner: the jobs of the migrations belong to postgres.
		await admin.unsafe(`select cron.unschedule(jobname) from cron.job where jobname is not null`);
		await superuser.unsafe('drop schema if exists app cascade');
		for (const role of APP_ROLES) {
			await superuser.unsafe(`drop owned by ${role}`);
			await superuser.unsafe(`drop role ${role}`);
		}
		await superuser.unsafe('delete from supabase_migrations.schema_migrations');

		// 2. The old order fails: the role comes from the migrations.
		await expect(admin.unsafe(`alter role app_server with password 'app_server_test'`)).rejects.toMatchObject({ code: '42704' });

		// 3. The release's own command, with the real CLI: every migration listed, then applied.
		// The local stack serves Postgres without TLS: the CLI needs it said explicitly.
		const localUrl = `${databaseUrl}?sslmode=disable`;
		const listed = migrationCommand(localUrl, true);
		const dry = await runCommand(listed.cmd, listed.args, listed.env);
		expect(dry.code, dry.out).toBe(0);
		for (const file of readdirSync('supabase/migrations')) expect(dry.out).toContain(file);
		const applied = migrationCommand(localUrl, false);
		const push = await runCommand(applied.cmd, applied.args, applied.env);
		expect(push.code, push.out).toBe(0);

		// 4. Then the password, and the check that Hyperdrive's credentials work.
		await admin.unsafe(`alter role app_server with password 'app_server_test'`);
		const appServer = new URL(databaseUrl);
		appServer.username = 'app_server';
		appServer.password = 'app_server_test';
		const env = join(mkdtempSync(join(tmpdir(), 'fresh-')), 'local.env');
		writeFileSync(env, `APP_SERVER_DATABASE_URL=${appServer.toString()}\n`);
		const check = await runCommand(process.execPath, ['scripts/import/load.ts', '--env-file', env, '--check-connection', '--local']);
		expect(check.code, check.out).toBe(0);
		expect(check.out).toContain('0 families, 0 recipes visible to app_job');

		// 5. Nothing left to apply.
		const again = await runCommand(listed.cmd, listed.args, listed.env);
		expect(again.out).toContain('Remote database is up to date');
	});
});
