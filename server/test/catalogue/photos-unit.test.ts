import { describe, expect, it } from 'vitest';
import { downloadImage, readLimited } from '../../src/catalogue/photos/download.ts';
import { PhotoError, PhotoServiceError } from '../../src/catalogue/photos/errors.ts';
import { newPhotoKey, PHOTO_KEY, photoPath, photoUrl } from '../../src/catalogue/photos/key.ts';
import { processPhoto } from '../../src/catalogue/photos/process.ts';
import { allowedImageUrl } from '../../src/catalogue/photos/url.ts';
import { avifOf, fakeImages, gifOf, jpegOf, pngOf, SVG } from '../support/images.ts';

const APP_HOST = 'cosasimangia.qunidi.it';
const MiB = 1024 * 1024;

async function codeOf(promise: Promise<unknown>): Promise<string> {
	try {
		await promise;
		return 'no error';
	} catch (error) {
		if (error instanceof PhotoError) return error.code;
		if (error instanceof PhotoServiceError) return error.limit ? 'service:limit' : 'service';
		throw error;
	}
}

describe('allowedImageUrl', () => {
	it('accepts a public https address', () => {
		expect(allowedImageUrl('https://ricette.example.it/a.jpg', APP_HOST)?.href).toBe('https://ricette.example.it/a.jpg');
		expect(allowedImageUrl('https://ricette.example.it:443/a.jpg', APP_HOST)).not.toBeNull();
	});

	it.each([
		'http://ricette.example.it/a.jpg',
		'https://user:pw@x.it/a',
		'https://x.it:8443/a',
		'https://127.0.0.1/a',
		'https://[::1]/a',
		'https://0x7f.1/a',
		'https://2130706433/a',
		'https://localhost/a',
		'https://localhost./a',
		'https://localhost../a',
		'https://nas.local../a',
		`https://${APP_HOST}../a`,
		'https://a..b.it/a',
		'https://intranet/a',
		'https://nas.local/a',
		'https://x.internal/a',
		'https://a.localhost/a',
		'https://router.home.arpa/a',
		`https://${APP_HOST}/photos/x.webp`,
		'https://w.workers.dev/a',
		'https://p.supabase.co/a',
		'not a url',
		`https://x.it/${'a'.repeat(2049 - 'https://x.it/'.length)}`,
	])('refuses %s', (raw) => {
		expect(allowedImageUrl(raw, APP_HOST)).toBeNull();
	});
});

type Call = { url: string; init: RequestInit };

function fakeFetch(answers: Array<(url: string) => Response | Promise<Response>>) {
	const calls: Call[] = [];
	const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		calls.push({ url, init: init ?? {} });
		const answer = answers[Math.min(calls.length - 1, answers.length - 1)]!;
		return answer(url);
	}) as typeof globalThis.fetch;
	return { fetch, calls };
}

const redirect = (location: string) => () => new Response(null, { status: 302, headers: { location } });
const image = () => new Response(jpegOf(1200, 800), { headers: { 'content-type': 'image/jpeg' } });
const start = new URL('https://ricette.example.it/a.jpg');

describe('downloadImage', () => {
	it('downloads with minimal headers and manual redirects', async () => {
		const { fetch, calls } = fakeFetch([redirect('/b.jpg'), image]);
		const bytes = await downloadImage(start, { fetch, appHost: APP_HOST });
		expect(bytes).toEqual(jpegOf(1200, 800));
		expect(calls.map((c) => c.url)).toEqual(['https://ricette.example.it/a.jpg', 'https://ricette.example.it/b.jpg']);
		for (const call of calls) {
			expect(call.init.redirect).toBe('manual');
			const headers = new Headers(call.init.headers);
			expect(headers.get('accept')).toBe('image/*');
			expect(headers.has('cookie')).toBe(false);
			expect(headers.has('authorization')).toBe(false);
		}
	});

	it('refuses a redirect to a blocked host', async () => {
		const { fetch, calls } = fakeFetch([redirect('https://127.0.0.1/'), image]);
		expect(await codeOf(downloadImage(start, { fetch, appHost: APP_HOST }))).toBe('photo_url');
		expect(calls).toHaveLength(1);
	});

	it('a malformed redirect address is refused as an address, not an internal error', async () => {
		const { fetch } = fakeFetch([redirect('https://[bad'), image]);
		expect(await codeOf(downloadImage(start, { fetch, appHost: APP_HOST }))).toBe('photo_url');
	});

	it('gives up after three redirects', async () => {
		const { fetch, calls } = fakeFetch([redirect('/1'), redirect('/2'), redirect('/3'), redirect('/4'), image]);
		expect(await codeOf(downloadImage(start, { fetch, appHost: APP_HOST }))).toBe('photo_unreachable');
		expect(calls).toHaveLength(4);
	});

	it('an HTTP error is unreachable', async () => {
		const { fetch } = fakeFetch([() => new Response('missing', { status: 404 })]);
		expect(await codeOf(downloadImage(start, { fetch, appHost: APP_HOST }))).toBe('photo_unreachable');
	});

	it('a network error is unreachable', async () => {
		const fetch = (async () => {
			throw new TypeError('fetch failed');
		}) as typeof globalThis.fetch;
		expect(await codeOf(downloadImage(start, { fetch, appHost: APP_HOST }))).toBe('photo_unreachable');
	});

	it('refuses a declared oversized body without reading it', async () => {
		let pulled = false;
		const body = new ReadableStream<Uint8Array>(
			{
				pull() {
					pulled = true;
				},
			},
			{ highWaterMark: 0 },
		);
		const { fetch } = fakeFetch([() => new Response(body, { headers: { 'content-length': '11000000' } })]);
		expect(await codeOf(downloadImage(start, { fetch, appHost: APP_HOST }))).toBe('photo_too_large');
		expect(pulled).toBe(false);
	});

	it('stops reading past the limit', async () => {
		let produced = 0;
		let cancelled = false;
		const chunk = new Uint8Array(64 * 1024);
		const body = new ReadableStream<Uint8Array>({
			pull(controller) {
				produced += chunk.length;
				controller.enqueue(chunk);
			},
			cancel() {
				cancelled = true;
			},
		});
		const { fetch } = fakeFetch([() => new Response(body)]);
		expect(await codeOf(downloadImage(start, { fetch, appHost: APP_HOST }))).toBe('photo_too_large');
		expect(cancelled).toBe(true);
		expect(produced).toBeLessThanOrEqual(10 * MiB + 2 * chunk.length);
	});

	it('a timeout is unreachable', async () => {
		const fetch = ((_input: RequestInfo | URL, init?: RequestInit) =>
			new Promise<Response>((_resolve, reject) => {
				init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
			})) as typeof globalThis.fetch;
		expect(await codeOf(downloadImage(start, { fetch, appHost: APP_HOST, timeoutMs: 50 }))).toBe('photo_unreachable');
	});
});

describe('readLimited', () => {
	it('returns the bytes under the limit', async () => {
		expect(await readLimited(new Response(new Uint8Array([1, 2, 3])).body!, 3)).toEqual(new Uint8Array([1, 2, 3]));
	});

	it('throws photo_too_large past the limit', async () => {
		expect(await codeOf(readLimited(new Response(new Uint8Array(4)).body!, 3))).toBe('photo_too_large');
	});
});

describe('processPhoto', () => {
	it('turns a large JPEG into a WebP of at most 1600 px', async () => {
		const photo = await processPhoto(fakeImages(), jpegOf(3000, 2000));
		expect(photo).toMatchObject({ contentType: 'image/webp', width: 1600, height: 1067 });
		expect(photo.body.byteLength).toBeGreaterThan(0);
	});

	it('keeps the size of a smaller PNG', async () => {
		expect(await processPhoto(fakeImages(), pngOf(800, 600))).toMatchObject({ width: 800, height: 600 });
	});

	it.each([
		['AVIF', avifOf(1200, 800)],
		['SVG', SVG],
		['GIF', gifOf(1200, 800)],
	])('refuses %s', async (_name, bytes) => {
		expect(await codeOf(processPhoto(fakeImages(), bytes))).toBe('photo_type');
	});

	it('refuses a short side under 400 px', async () => {
		expect(await codeOf(processPhoto(fakeImages(), jpegOf(600, 300)))).toBe('photo_too_small');
	});

	it('refuses an input over 10 MiB', async () => {
		const bytes = new Uint8Array(10 * MiB + 1);
		bytes.set(jpegOf(1200, 800));
		expect(await codeOf(processPhoto(fakeImages(), bytes))).toBe('photo_too_large');
	});

	it('an image the binding cannot read is unreadable', async () => {
		expect(await codeOf(processPhoto(fakeImages({ fail: 'unreadable' }), jpegOf(1200, 800)))).toBe('photo_unreadable');
		expect(await codeOf(processPhoto(fakeImages(), new Uint8Array([1, 2, 3, 4])))).toBe('photo_unreadable');
	});

	it('the monthly limit is a service error', async () => {
		expect(await codeOf(processPhoto(fakeImages({ fail: 'limit' }), jpegOf(1200, 800)))).toBe('service:limit');
		expect(await codeOf(processPhoto(fakeImages({ fail: 'service' }), jpegOf(1200, 800)))).toBe('service');
	});

	it('a service error while reading the input is a service error, not an unreadable image', async () => {
		expect(await codeOf(processPhoto(fakeImages({ fail: 'info-service' }), jpegOf(1200, 800)))).toBe('service');
		const internal = { info: async () => Promise.reject(new Error('ERROR 9516: internal error')) } as never;
		expect(await codeOf(processPhoto(internal, jpegOf(1200, 800)))).toBe('service');
	});

	it('refuses a result over 1 MiB', async () => {
		expect(await codeOf(processPhoto(fakeImages({ outputBytes: MiB + 1 }), jpegOf(1200, 800)))).toBe('photo_too_large');
	});
});

describe('photo keys', () => {
	it('are 128 random bits in base64url', () => {
		const a = newPhotoKey();
		const b = newPhotoKey();
		expect(a).toMatch(PHOTO_KEY);
		expect(b).toMatch(PHOTO_KEY);
		expect(a).not.toBe(b);
	});

	it('become a relative or absolute URL', () => {
		const key = newPhotoKey();
		expect(photoPath(key)).toBe(`/${key}`);
		expect(photoUrl(key)).toBe(`/${key}`);
		expect(photoUrl(key, 'https://app.test')).toBe(`https://app.test/${key}`);
	});
});
