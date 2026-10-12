// Plans one run of scripts/prod-sql.sh (detail spec, section 8) without connecting: checks the file, the
// --set pairs and POSTGRES_DATABASE_URL of the credentials file, then computes the operation fingerprint
// that --confirm must repeat. The endpoint goes to stderr; stdout, captured by the script and never shown,
// carries the fingerprint on the first line and the checked url on the second.
// Usage: node scripts/prod-sql-plan.ts <credentials> <production|local> <file.sql> <0|1 launch> [name=value ...]
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { checkTarget, describeEndpoint, productionRef } from './import/load/target.ts';

export class PlanError extends Error {
	constructor(reason: string) {
		super(reason);
		this.name = 'PlanError';
	}
}

const SET = /^([a-z_]+)=([0-9A-Za-z_-]+)$/;
const sha = (data: string) => createHash('sha256').update(data).digest('hex');

export function checkTransaction(text: string) {
	const lines = text.split('\n');
	if (lines.filter((l) => l === 'begin;').length !== 1 || lines.filter((l) => l === 'commit;').length !== 1)
		throw new PlanError("the file needs exactly one 'begin;' and one 'commit;' line");
}

export function normalizeSets(pairs: string[]): string[] {
	const names = new Set<string>();
	for (const pair of pairs) {
		const match = SET.exec(pair);
		if (!match) throw new PlanError(`--set ${pair}: the name is [a-z_]+, the value letters, digits, - and _`);
		if (names.has(match[1]!)) throw new PlanError(`--set ${match[1]} given twice`);
		names.add(match[1]!);
	}
	return [...pairs].sort();
}

export const operationFingerprint = (op: { file: string; fingerprintSql: string; launch: boolean; sets: string[]; endpoint: string }) =>
	sha(JSON.stringify({ file: sha(op.file), fingerprintSql: sha(op.fingerprintSql), launch: op.launch, sets: normalizeSets(op.sets), endpoint: op.endpoint }));

function main() {
	const [credentials, target, file, launch, ...sets] = process.argv.slice(2);
	const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
	const text = readFileSync(file!, 'utf8');
	checkTransaction(text);
	const env = parseEnv(readFileSync(credentials!, 'utf8'));
	const { endpoint } = checkTarget('POSTGRES_DATABASE_URL', env.POSTGRES_DATABASE_URL, { role: 'postgres', target: target === 'local' ? 'local' : 'production', ref: productionRef(root) });
	const where = describeEndpoint(endpoint);
	const operation = operationFingerprint({ file: text, fingerprintSql: readFileSync(resolve(root, 'supabase/scripts/app-fingerprint.sql'), 'utf8'), launch: launch === '1', sets, endpoint: where });
	console.error(`Target: ${where}`);
	process.stdout.write(`${operation}\n${env.POSTGRES_DATABASE_URL}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		main();
	} catch (error) {
		const name = error instanceof Error ? error.name : '';
		console.error(name === 'PlanError' || name === 'TargetError' ? `refused: ${(error as Error).message}` : 'refused: file or credentials not readable');
		process.exitCode = 1;
	}
}
