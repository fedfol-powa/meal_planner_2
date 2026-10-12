import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// What the preview showed (detail spec, section 6): every file the load reads, the commit of the
// scripts, the arguments and the destination. --confirm recomputes it before connecting.
const sha = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

function files(dir: string, keep: (path: string) => boolean): string[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		return statSync(path).isDirectory() ? files(path, keep) : keep(path) ? [path] : [];
	});
}

export function inputsFingerprint(args: { originDirectory: string; importDirectory: string; head: string; today: string; familyId: string; curatorId: string; launchFrom: string | null; endpoint: string }): string {
	const read = [
		...files(join(args.originDirectory, 'ricettario'), () => true),
		...files(join(args.originDirectory, 'menu'), (p) => p.endsWith('/menu.yaml')),
	].map((p) => [`origin/${relative(args.originDirectory, p)}`, sha(readFileSync(p))]);
	const yaml = files(args.importDirectory, (p) => p.endsWith('.yaml') && !p.includes('/out/')).map((p) => [`import/${relative(args.importDirectory, p)}`, sha(readFileSync(p))]);
	const all = [...read, ...yaml].sort(([a], [b]) => a!.localeCompare(b!));
	const { originDirectory, importDirectory, ...rest } = args;
	return sha(JSON.stringify({ files: all, ...rest })).slice(0, 16);
}
