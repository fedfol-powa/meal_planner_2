import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';

// What the preview showed (detail spec, section 6; review of PR #34, finding 5): the files the load reads
// are copied once into a private snapshot, the fingerprint is computed on those bytes, and the load reads
// only the snapshot. A file changed while the load waits for its locks changes nothing.
const sha = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

function files(dir: string, keep: (path: string) => boolean): string[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		return statSync(path).isDirectory() ? files(path, keep) : keep(path) ? [path] : [];
	});
}

export interface InputSnapshot {
	/** The snapshot folder (mode 0700). */
	dir: string;
	/** Stands in for the repository root: scripts/import/*.yaml. */
	root: string;
	/** Stands in for the origin project: ricettario/** and menu/<monday>/menu.yaml. */
	origin: string;
	files: { name: string; bytes: Buffer }[];
	dispose(): void;
}

export function snapshotInputs(originDirectory: string, importDirectory: string): InputSnapshot {
	const dir = mkdtempSync(join(tmpdir(), 'load-inputs-'));
	chmodSync(dir, 0o700);
	const root = join(dir, 'root');
	const origin = join(dir, 'origin');
	const read = [
		...files(join(originDirectory, 'ricettario'), () => true).map((p) => ({ name: `origin/${relative(originDirectory, p)}`, to: join(origin, relative(originDirectory, p)), from: p })),
		...files(join(originDirectory, 'menu'), (p) => p.endsWith('/menu.yaml')).map((p) => ({ name: `origin/${relative(originDirectory, p)}`, to: join(origin, relative(originDirectory, p)), from: p })),
		...files(importDirectory, (p) => p.endsWith('.yaml') && !relative(importDirectory, p).startsWith('out/'))
			.map((p) => ({ name: `import/${relative(importDirectory, p)}`, to: join(root, 'scripts/import', relative(importDirectory, p)), from: p })),
	];
	const copied = read.map(({ name, from, to }) => {
		const bytes = readFileSync(from);
		mkdirSync(dirname(to), { recursive: true });
		writeFileSync(to, bytes);
		return { name, bytes };
	});
	mkdirSync(origin, { recursive: true });
	return { dir, root, origin, files: copied.sort((a, b) => a.name.localeCompare(b.name)), dispose: () => rmSync(dir, { recursive: true, force: true }) };
}

export function inputsFingerprint(snapshot: InputSnapshot['files'], args: { head: string; today: string; familyId: string; curatorId: string; launchFrom: string | null; endpoint: string }): string {
	return sha(JSON.stringify({ files: snapshot.map((f) => [f.name, sha(f.bytes)]), ...args })).slice(0, 16);
}
