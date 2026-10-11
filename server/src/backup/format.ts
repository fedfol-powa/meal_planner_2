/**
 * Binary format of the nightly export (spec 2026-10-11-esportazione-r2, section 2):
 * "CSM1", format version, key id, IV, then AES-256-GCM of the gzipped JSON document.
 * The header is authenticated data. Pure: runs in the Worker and in Node.
 */
export const EXPORT_FORMAT = 'cosasimangia-export/1';
const MAGIC = new TextEncoder().encode('CSM1');
const BINARY_VERSION = 1;
const IV_BYTES = 12;

export type BackupKey = Awaited<ReturnType<typeof crypto.subtle.importKey>>;

export class ExportFormatError extends Error {
	readonly reason: 'magic' | 'version' | 'unknown_key' | 'corrupt';
	constructor(reason: ExportFormatError['reason']) {
		super(`invalid export: ${reason}`);
		this.name = 'ExportFormatError';
		this.reason = reason;
	}
}

export async function importKey(base64: string): Promise<BackupKey> {
	const raw = Uint8Array.from(atob(base64.trim()), (c) => c.charCodeAt(0));
	if (raw.length !== 32) throw new Error('backup key must be 32 bytes');
	return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** `k1=<base64>,k2=<base64>`; a single key without a name is k1. */
export async function parseKeyList(value: string): Promise<Record<string, BackupKey>> {
	const entries = value.split(',').map((p) => p.trim()).filter(Boolean);
	const keys: Record<string, BackupKey> = {};
	for (const entry of entries) {
		const named = /^([A-Za-z0-9_-]+)=(.+)$/.exec(entry);
		// A bare base64 key may end with "=": only "<id>=<44 chars>" counts as named.
		if (named && named[2].length >= 40) keys[named[1]] = await importKey(named[2]);
		else if (entries.length === 1) keys.k1 = await importKey(entry);
		else throw new Error('backup key list: use k1=<base64>,k2=<base64>');
	}
	return keys;
}

function header(keyId: string): Uint8Array<ArrayBuffer> {
	const id = new TextEncoder().encode(keyId);
	if (id.length === 0 || id.length > 255) throw new Error('invalid key id');
	const out = new Uint8Array(MAGIC.length + 2 + id.length);
	out.set(MAGIC);
	out[4] = BINARY_VERSION;
	out[5] = id.length;
	out.set(id, 6);
	return out;
}

const drain = async (stream: ReadableStream<Uint8Array>) => new Uint8Array(await new Response(stream).arrayBuffer());

/** The parts become one UTF-8 Blob, streamed through gzip: no joined string is ever built. */
export async function encodeExport(parts: string[], key: BackupKey, keyId: string): Promise<{ blob: Blob; uncompressedBytes: number; storedBytes: number }> {
	const head = header(keyId);
	const source = new Blob(parts);
	const gzipped = await drain(source.stream().pipeThrough(new CompressionStream('gzip')));
	const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
	const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: head }, key, gzipped);
	const blob = new Blob([head, iv, sealed]);
	return { blob, uncompressedBytes: source.size, storedBytes: blob.size };
}

export async function decodeExport(bytes: Uint8Array, keys: Readonly<Record<string, BackupKey>>): Promise<string> {
	if (bytes.length < 6 || !MAGIC.every((b, i) => bytes[i] === b)) throw new ExportFormatError('magic');
	if (bytes[4] !== BINARY_VERSION) throw new ExportFormatError('version');
	const end = 6 + bytes[5];
	const key = keys[new TextDecoder().decode(bytes.subarray(6, end))];
	if (!key) throw new ExportFormatError('unknown_key');
	let gzipped: ArrayBuffer;
	try {
		gzipped = await crypto.subtle.decrypt(
			{ name: 'AES-GCM', iv: bytes.slice(end, end + IV_BYTES), additionalData: bytes.slice(0, end) },
			key,
			bytes.slice(end + IV_BYTES),
		);
	} catch {
		throw new ExportFormatError('corrupt');
	}
	return new TextDecoder().decode(await drain(new Blob([gzipped]).stream().pipeThrough(new DecompressionStream('gzip'))));
}
