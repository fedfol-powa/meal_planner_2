import { describe, expect, it } from 'vitest';
import { decodeExport, encodeExport, ExportFormatError, importKey, parseKeyList } from './format.ts';

const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const randomKey = () => base64(crypto.getRandomValues(new Uint8Array(32)));
const bytesOf = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());

describe('export format', () => {
	it('round-trips a document given in parts, reporting sizes', async () => {
		const key = await importKey(randomKey());
		const parts = ['{"hello":"mondo è",', '"n":12345678901234567890.1}'];
		const { blob, uncompressedBytes, storedBytes } = await encodeExport(parts, key, 'k1');
		const bytes = await bytesOf(blob);
		expect(new TextDecoder().decode(bytes.subarray(0, 4))).toBe('CSM1');
		expect(uncompressedBytes).toBe(new TextEncoder().encode(parts.join('')).length);
		expect(storedBytes).toBe(bytes.length);
		await expect(decodeExport(bytes, { k1: key })).resolves.toBe(parts.join(''));
	});

	it('uses a fresh IV every time', async () => {
		const key = await importKey(randomKey());
		const a = await bytesOf((await encodeExport(['{}'], key, 'k1')).blob);
		const b = await bytesOf((await encodeExport(['{}'], key, 'k1')).blob);
		expect(base64(a.subarray(8, 20))).not.toBe(base64(b.subarray(8, 20)));
	});

	it('rejects keys that are not 32 bytes', async () => {
		await expect(importKey(base64(new Uint8Array(16)))).rejects.toThrow('32 bytes');
	});

	it('parses a key list, a single key meaning k1', async () => {
		expect(Object.keys(await parseKeyList(randomKey()))).toEqual(['k1']);
		expect(Object.keys(await parseKeyList(`k1=${randomKey()},k2=${randomKey()}`))).toEqual(['k1', 'k2']);
	});

	const reason = async (promise: Promise<unknown>) => {
		const error = await promise.then(() => null, (e: unknown) => e);
		expect(error).toBeInstanceOf(ExportFormatError);
		return (error as ExportFormatError).reason;
	};

	it('rejects a wrong key, an unknown key id, a bad magic or version, an altered header or body', async () => {
		const k1 = await importKey(randomKey());
		const k2 = await importKey(randomKey());
		const bytes = await bytesOf((await encodeExport(['{"a":1}'], k1, 'k1')).blob);
		expect(await reason(decodeExport(bytes, { k1: k2 }))).toBe('corrupt');
		expect(await reason(decodeExport(bytes, { k2 }))).toBe('unknown_key');
		const badMagic = bytes.slice(); badMagic[0] = 0x58;
		expect(await reason(decodeExport(badMagic, { k1 }))).toBe('magic');
		const badVersion = bytes.slice(); badVersion[4] = 9;
		expect(await reason(decodeExport(badVersion, { k1 }))).toBe('version');
		// Same length, other id: the header is authenticated, so k1 cannot open it as k2.
		const otherId = bytes.slice(); otherId[7] = '2'.charCodeAt(0);
		expect(await reason(decodeExport(otherId, { k2: k1 }))).toBe('corrupt');
		const badBody = bytes.slice(); badBody[bytes.length - 1] ^= 1;
		expect(await reason(decodeExport(badBody, { k1 }))).toBe('corrupt');
	});
});
