import type { PhotoImages } from '../../src/catalogue/photos/process.ts';

/**
 * A fake of the Images binding for the tests (spec section 4): `info` reads format and size
 * from the file header, `output` returns a minimal WebP scaled like `fit: 'scale-down'`.
 */
export interface FakeImagesOptions {
	fail?: 'unreadable' | 'limit' | 'service';
	/** Pads the output to this many bytes. */
	outputBytes?: number;
}

export interface FakeImages extends PhotoImages {
	calls: { info: number; input: number };
}

async function bytesOf(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

function u16be(b: Uint8Array, at: number) {
	return (b[at]! << 8) | b[at + 1]!;
}
function u32be(b: Uint8Array, at: number) {
	return ((b[at]! << 24) >>> 0) + (b[at + 1]! << 16) + (b[at + 2]! << 8) + b[at + 3]!;
}
function u24le(b: Uint8Array, at: number) {
	return b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16);
}
function ascii(b: Uint8Array, at: number, length: number) {
	return String.fromCharCode(...b.subarray(at, at + length));
}

class FakeImagesError extends Error {
	readonly code: number;
	constructor(code: number, message: string) {
		super(message);
		this.code = code;
	}
}

function readHeader(b: Uint8Array): ImageInfoResponse {
	if (b[0] === 0xff && b[1] === 0xd8) {
		for (let at = 2; at + 9 < b.length; ) {
			const marker = u16be(b, at);
			const length = u16be(b, at + 2);
			if (marker === 0xffc0 || marker === 0xffc2)
				return { format: 'image/jpeg', fileSize: b.length, height: u16be(b, at + 5), width: u16be(b, at + 7) };
			at += 2 + length;
		}
	}
	if (ascii(b, 1, 3) === 'PNG') return { format: 'image/png', fileSize: b.length, width: u32be(b, 16), height: u32be(b, 20) };
	if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP' && ascii(b, 12, 4) === 'VP8X')
		return { format: 'image/webp', fileSize: b.length, width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
	if (ascii(b, 4, 8) === 'ftypavif') return { format: 'image/avif', fileSize: b.length, width: u32be(b, 12), height: u32be(b, 16) };
	if (ascii(b, 0, 3) === 'GIF') return { format: 'image/gif', fileSize: b.length, width: b[6]! | (b[7]! << 8), height: b[8]! | (b[9]! << 8) };
	if (/^\s*(<\?xml|<svg)/.test(ascii(b, 0, Math.min(b.length, 64)))) return { format: 'image/svg+xml' };
	throw new FakeImagesError(9412, 'ERROR 9412: Input is not an image');
}

export function fakeImages(options: FakeImagesOptions = {}): FakeImages {
	const calls = { info: 0, input: 0 };
	return {
		calls,
		async info(stream) {
			calls.info++;
			const bytes = await bytesOf(stream);
			if (options.fail === 'unreadable') throw new FakeImagesError(9412, 'ERROR 9412: Input is not an image');
			return readHeader(bytes);
		},
		input(stream) {
			calls.input++;
			let fit = { width: Infinity, height: Infinity };
			const transformer = {
				transform(transform: ImageTransform) {
					fit = { width: transform.width ?? Infinity, height: transform.height ?? Infinity };
					return transformer;
				},
				draw() {
					return transformer;
				},
				async output(): Promise<ImageTransformationResult> {
					const info = readHeader(await bytesOf(stream));
					if (options.fail === 'limit') throw new Error('ERROR 9422: monthly transformation limit');
					if (options.fail === 'service') throw new Error('ERROR 9500: service unavailable');
					if (!('width' in info)) throw new FakeImagesError(9412, 'ERROR 9412: Input is not an image');
					const scale = Math.min(1, fit.width / info.width, fit.height / info.height);
					const body = webpOf(Math.round(info.width * scale), Math.round(info.height * scale), options.outputBytes);
					return {
						contentType: () => 'image/webp',
						image: () => new Response(body).body!,
						response: () => new Response(body, { headers: { 'content-type': 'image/webp' } }),
					};
				},
			};
			return transformer as unknown as ImageTransformer;
		},
	};
}

/** A JPEG with only SOI and a SOF0 header: enough for `info`. */
export function jpegOf(width: number, height: number): Uint8Array {
	return new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xd9]);
}

export function pngOf(width: number, height: number): Uint8Array {
	const b = new Uint8Array(33);
	b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
	new DataView(b.buffer).setUint32(16, width);
	new DataView(b.buffer).setUint32(20, height);
	return b;
}

export function avifOf(width: number, height: number): Uint8Array {
	const b = new Uint8Array(24);
	b.set([0, 0, 0, 24, ...new TextEncoder().encode('ftypavif')]);
	new DataView(b.buffer).setUint32(12, width);
	new DataView(b.buffer).setUint32(16, height);
	return b;
}

export function gifOf(width: number, height: number): Uint8Array {
	return new Uint8Array([...new TextEncoder().encode('GIF89a'), width & 0xff, width >> 8, height & 0xff, height >> 8, 0, 0, 0]);
}

export const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><script>alert(1)</script></svg>');

/** A VP8X WebP header, padded to `size` bytes when given. */
export function webpOf(width: number, height: number, size = 30): Uint8Array {
	const b = new Uint8Array(Math.max(30, size));
	const text = new TextEncoder();
	b.set(text.encode('RIFF'), 0);
	new DataView(b.buffer).setUint32(4, b.length - 8, true);
	b.set(text.encode('WEBPVP8X'), 8);
	new DataView(b.buffer).setUint32(16, 10, true);
	const w = width - 1;
	const h = height - 1;
	b.set([w & 0xff, (w >> 8) & 0xff, (w >> 16) & 0xff, h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff], 24);
	return b;
}
