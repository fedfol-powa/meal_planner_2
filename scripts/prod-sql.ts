// SQL on the production database (detail spec of the production launch, section 8; review of PR #34,
// findings 1, 4 and 5). Only the scripts of a closed list, by name; with the production target their
// bytes come from HEAD of a clean checkout, read once: the fingerprint and psql get the same bytes, on
// psql's standard input. The tool decides the transaction (begin … rollback for --preview,
// --single-transaction for --apply, ON_ERROR_STOP always); the password travels only in PGPASSWORD, the
// TLS settings in PGSSLMODE and PGSSLROOTCERT.
// Usage: node scripts/prod-sql.ts --preview <script> [--launch] [--set name=value …] [--credentials <file>]
//        node scripts/prod-sql.ts --apply <script> [--launch] [--set name=value …] --confirm <operation> [--credentials <file>]
// Environment: PROD_SQL_TARGET=local (tests only: local host, no checkout check), CONTAINER_CLI (podman by
// default, docker in CI).
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, parseEnv } from 'node:util';
import { checkTarget, describeEndpoint, productionRef, psqlConninfo, psqlTlsEnv, TargetError } from './import/load/target.ts';
import { checkSqlText, SqlTextError } from './prod-sql/tokens.ts';

type VariableType = 'uuid' | 'date' | 'fingerprint' | 'measurement_system' | 'time_zone' | 'text' | 'people';
export interface ScriptSpec { file: string; variables: Record<string, VariableType>; readOnly: boolean; launch: boolean }

export const SCRIPTS: Record<string, ScriptSpec> = {
	'migrations-state': { file: 'supabase/scripts/migrations-state.sql', variables: {}, readOnly: true, launch: false },
	'show-fingerprint': { file: 'supabase/scripts/show-fingerprint.sql', variables: {}, readOnly: true, launch: false },
	'check-first-generation': { file: 'supabase/scripts/check-first-generation.sql', variables: { family_id: 'uuid', week_start: 'date' }, readOnly: true, launch: false },
	bootstrap: {
		file: 'supabase/scripts/bootstrap.sql',
		variables: { family_id: 'uuid', family_name: 'text', measurement_system: 'measurement_system', time_zone: 'time_zone', people: 'people' },
		readOnly: false,
		launch: true,
	},
	'reset-app-data': { file: 'supabase/scripts/reset-app-data.sql', variables: { expected_fingerprint: 'fingerprint' }, readOnly: false, launch: false },
	// Operational alerts (spec W15, section 9, points 9 and 10).
	'ops-alert-test': { file: 'supabase/scripts/ops-alert-test.sql', variables: { day: 'date' }, readOnly: false, launch: false },
	'ops-alerts-unsent': { file: 'supabase/scripts/ops-alerts-unsent.sql', variables: {}, readOnly: true, launch: false },
};

const FINGERPRINT_FILE = 'supabase/scripts/app-fingerprint.sql';
const DEFAULT_CREDENTIALS = '/Users/fedfol/Projects/meal_planner_2/.env.production.local';
const IMAGE = 'public.ecr.aws/supabase/postgres:17.11.0.004';

export class OperationError extends Error {
	constructor(reason: string) {
		super(reason);
		this.name = 'OperationError';
	}
}

export interface Command { mode: 'preview' | 'apply'; name: string; launch: boolean; sets: Record<string, string>; confirm?: string; credentials: string }

export function parseCommand(argv: string[]): Command {
	let parsed;
	try {
		parsed = parseArgs({ args: argv, strict: true, allowPositionals: false, options: {
			preview: { type: 'string' }, apply: { type: 'string' }, launch: { type: 'boolean' },
			set: { type: 'string', multiple: true }, confirm: { type: 'string' }, credentials: { type: 'string' },
		} });
	} catch {
		throw new OperationError('unknown or malformed option');
	}
	const { values } = parsed;
	if ((values.preview === undefined) === (values.apply === undefined)) throw new OperationError('give either --preview <script> or --apply <script>');
	const sets: Record<string, string> = {};
	for (const pair of values.set ?? []) {
		const at = pair.indexOf('=');
		const name = at < 0 ? pair : pair.slice(0, at);
		if (at < 0 || !/^[a-z_]+$/.test(name)) throw new OperationError(`--set ${name}: name=value, the name in [a-z_]`);
		if (name in sets) throw new OperationError(`--set ${name} given twice`);
		sets[name] = pair.slice(at + 1);
	}
	return { mode: values.preview !== undefined ? 'preview' : 'apply', name: (values.preview ?? values.apply)!, launch: values.launch === true, sets, confirm: values.confirm, credentials: values.credentials ?? DEFAULT_CREDENTIALS };
}

const CONTROL_CHARACTER = /\p{Cc}/u;
const isText = (value: unknown, max = 200): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max && !CONTROL_CHARACTER.test(value);
const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);
const isTimeZone = (value: string) => {
	try {
		new Intl.DateTimeFormat('en-GB', { timeZone: value });
		return /^[A-Za-z_]+(\/[A-Za-z_+-]+)*$/.test(value);
	} catch {
		return false;
	}
};

function checkPeople(value: string) {
	let people: unknown;
	try {
		people = JSON.parse(value);
	} catch {
		throw new OperationError('people: not JSON');
	}
	if (!Array.isArray(people) || people.length === 0 || people.length > 20) throw new OperationError('people: an array of 1 to 20 people');
	const keys = ['display_name', 'email', 'family_role', 'global_roles', 'locale'];
	for (const person of people) {
		if (!person || typeof person !== 'object' || Object.keys(person).sort().join() !== keys.join()) throw new OperationError(`people: each person has exactly ${keys.join(', ')}`);
		const p = person as Record<string, unknown>;
		if (!isText(p.email) || !/^[^@\s]+@[^@\s]+$/.test(p.email)) throw new OperationError('people: email');
		if (!isText(p.display_name)) throw new OperationError('people: display_name');
		if (p.locale !== 'it-IT' && p.locale !== 'en-GB') throw new OperationError('people: locale is it-IT or en-GB');
		if (p.family_role !== 'family_admin' && p.family_role !== 'member') throw new OperationError('people: family_role is family_admin or member');
		const roles = p.global_roles;
		if (!Array.isArray(roles) || roles.some((r) => r !== 'recipe_curator' && r !== 'app_admin') || new Set(roles).size !== roles.length)
			throw new OperationError('people: global_roles among recipe_curator, app_admin');
	}
}

const CHECKS: Record<VariableType, (value: string) => boolean> = {
	uuid: (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
	date: isDate,
	fingerprint: (v) => /^[0-9a-f]{32}$/.test(v),
	measurement_system: (v) => v === 'metric' || v === 'uk_imperial',
	time_zone: isTimeZone,
	text: (v) => isText(v),
	people: (v) => {
		checkPeople(v);
		return true;
	},
};

/** The closed list: name, variables and their types, read-only scripts, --launch. Nothing connects before. */
export function checkOperation(command: Command, scripts: Record<string, ScriptSpec> = SCRIPTS): ScriptSpec {
	const spec = Object.hasOwn(scripts, command.name) ? scripts[command.name]! : undefined;
	if (!spec) throw new OperationError(`${command.name} is not a service script (${Object.keys(scripts).join(', ')})`);
	if (command.launch && !spec.launch) throw new OperationError(`--launch only with the bootstrap, not with ${command.name}`);
	if (command.mode === 'apply' && spec.readOnly) throw new OperationError(`${command.name} is read only: --preview only`);
	if (command.mode === 'apply' && !command.confirm) throw new OperationError('--apply needs --confirm <operation> from the preview');
	for (const name of Object.keys(command.sets)) if (!Object.hasOwn(spec.variables, name)) throw new OperationError(`${name} is not a variable of ${command.name}`);
	for (const [name, type] of Object.entries(spec.variables)) {
		const value = command.sets[name];
		if (value === undefined) throw new OperationError(`--set ${name} is required by ${command.name}`);
		if (!CHECKS[type](value)) throw new OperationError(`--set ${name}: not a valid ${type}`);
	}
	return spec;
}

const sha = (data: string) => createHash('sha256').update(data).digest('hex');

export const operationFingerprint = (op: { commit: string; fingerprintSql: string; script: string; name: string; launch: boolean; sets: Record<string, string>; endpoint: string }) =>
	sha(JSON.stringify({ commit: op.commit, fingerprintSql: sha(op.fingerprintSql), script: sha(op.script), name: op.name, launch: op.launch, sets: Object.entries(op.sets).sort(([a], [b]) => a.localeCompare(b)), endpoint: op.endpoint }));

const line = (text: string) => (text.endsWith('\n') ? text : `${text}\n`);
/** What psql reads: the files are statements only, the transaction is ours (or --single-transaction's). */
export function composeInput(parts: { fingerprintSql: string; script: string; launch: boolean; mode: 'preview' | 'apply' }): string {
	return [
		parts.mode === 'preview' ? 'begin;\n' : '',
		line(parts.fingerprintSql),
		parts.launch ? 'select pg_temp.launch_start();\n' : '',
		line(parts.script),
		parts.launch ? 'select pg_temp.app_fingerprint() as launch_baseline;\n' : '',
		parts.mode === 'preview' ? 'rollback;\n' : '',
	].join('');
}

/** Production: clean checkout, bytes of HEAD. Local (tests): the working tree. Read once either way. */
export function readSources(root: string, target: 'production' | 'local', paths: string[]): { commit: string; texts: string[] } {
	const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
	const commit = git('rev-parse', 'HEAD').trim();
	if (target === 'local') return { commit, texts: paths.map((p) => readFileSync(resolve(root, p), 'utf8')) };
	if (git('status', '--porcelain').trim() !== '') throw new OperationError('the checkout is not clean: commit or remove the local changes first');
	return { commit, texts: paths.map((p) => git('show', `HEAD:${p}`)) };
}

const shellWord = (word: string) => (/^[A-Za-z0-9_.\/:@=,+-]+$/.test(word) ? word : `'${word.replaceAll("'", `'\\''`)}'`);

export interface Io { out: (text: string) => void; err: (text: string) => void }
const processIo: Io = { out: (t) => process.stdout.write(t), err: (t) => process.stderr.write(t) };

export async function main(argv: string[], options: { root: string; env: NodeJS.ProcessEnv; scripts?: Record<string, ScriptSpec>; io?: Io }): Promise<number> {
	const io = options.io ?? processIo;
	const command = parseCommand(argv);
	const spec = checkOperation(command, options.scripts);
	const target = options.env.PROD_SQL_TARGET === 'local' ? 'local' : 'production';
	if (!existsSync(command.credentials)) throw new OperationError(`credentials file not found: ${command.credentials}`);
	const credentials = parseEnv(readFileSync(command.credentials, 'utf8'));
	const checked = checkTarget('POSTGRES_DATABASE_URL', credentials.POSTGRES_DATABASE_URL, { role: 'postgres', target, ref: productionRef(options.root) });
	const mountDir = join(options.env.HOME ?? homedir(), '.config/cosasimangia');
	if (checked.ssl && !checked.fields.caPath!.startsWith(`${mountDir}/`)) throw new OperationError('sslrootcert must be in ~/.config/cosasimangia, the folder mounted in the container');
	const where = describeEndpoint(checked.endpoint);
	const { commit, texts } = readSources(options.root, target, [FINGERPRINT_FILE, spec.file]);
	const [fingerprintSql, script] = texts as [string, string];
	checkSqlText(fingerprintSql);
	const used = checkSqlText(script).sort();
	if (used.join() !== Object.keys(spec.variables).sort().join()) throw new OperationError(`${spec.file} uses other variables than the list declares`);
	const operation = operationFingerprint({ commit, fingerprintSql, script, name: command.name, launch: command.launch, sets: command.sets, endpoint: where });
	if (command.mode === 'apply' && command.confirm !== operation) throw new OperationError('the operation changed since the preview (script, commit, --launch, --set or target): run --preview again');

	io.err(`Target: ${where}\n`);
	if (command.mode === 'preview') io.err(`Preview of ${command.name}: ends with rollback\n`);
	const input = composeInput({ fingerprintSql, script, launch: command.launch, mode: command.mode });
	// Password and TLS reach psql in its environment, by name: never in argv or in the connection string.
	const pgEnv = { PGPASSWORD: checked.fields.password, ...psqlTlsEnv(checked) };
	const args = [
		'run', '--rm', '-i', ...Object.keys(pgEnv).flatMap((name) => ['-e', name]),
		...(checked.ssl ? ['-v', `${mountDir}:${mountDir}:ro`] : []),
		'--network', 'host', IMAGE,
		'psql', psqlConninfo(checked), '-X', '-q', '-v', 'ON_ERROR_STOP=1',
		...(command.mode === 'apply' ? ['--single-transaction'] : []),
		...Object.entries(command.sets).flatMap(([k, v]) => ['-v', `${k}=${v}`]),
		'-f', '-',
	];
	const code = await new Promise<number>((done, fail) => {
		const child = spawn(options.env.CONTAINER_CLI || 'podman', args, {
			env: { ...options.env, PATH: `/opt/podman/bin:${options.env.PATH ?? ''}`, ...pgEnv },
			stdio: ['pipe', 'pipe', 'pipe'],
		});
		child.stdout.on('data', (d: Buffer) => io.out(d.toString()));
		child.stderr.on('data', (d: Buffer) => io.err(d.toString()));
		child.on('error', fail);
		child.on('close', (status) => done(status ?? 1));
		child.stdin.on('error', () => {}); // psql may exit before reading everything; its status says why
		child.stdin.end(input);
	});
	if (code !== 0) return code;
	if (command.mode === 'preview') {
		const shown = [
			'node scripts/prod-sql.ts --apply', command.name, ...(command.launch ? ['--launch'] : []),
			...Object.entries(command.sets).flatMap(([k, v]) => ['--set', shellWord(`${k}=${v}`)]),
			'--confirm', operation, ...(command.credentials !== DEFAULT_CREDENTIALS ? ['--credentials', shellWord(command.credentials)] : []),
		];
		io.err(`Apply with: ${shown.join(' ')}\n`);
	} else if (command.launch) io.err('Write the launch_baseline above in the coordination log: it replaces the previous one\n');
	return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main(process.argv.slice(2), { root: resolve(dirname(fileURLToPath(import.meta.url)), '..'), env: process.env }).then(
		(code) => {
			process.exitCode = code;
		},
		(error: unknown) => {
			const known = error instanceof OperationError || error instanceof TargetError || error instanceof SqlTextError;
			console.error(known ? `refused: ${(error as Error).message}` : `failed: ${error instanceof Error ? error.name : 'unknown'}`);
			process.exitCode = 1;
		},
	);
}
