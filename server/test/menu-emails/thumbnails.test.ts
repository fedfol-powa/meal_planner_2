import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PhotoImages } from '../../src/catalogue/photos/process.ts';
import { newPhotoKey } from '../../src/catalogue/photos/key.ts';
import { EMAIL_THUMBNAIL, emailThumbnailPath, ensureEmailThumbnail } from '../../src/menu-emails/thumbnails.ts';
import { jpegOf, webpOf } from '../support/images.ts';
import { MemoryBucket } from '../support/r2.ts';

/** An Images binding that records its transformations and answers a small JPEG, or throws in `output`. */
function recordingImages(options: { fail?: boolean } = {}) {
	const calls: { input: Uint8Array[]; transform: ImageTransform[]; output: ImageOutputOptions[] } = { input: [], transform: [], output: [] };
	const images: PhotoImages = {
		info: async () => {
			throw new Error('info is not used');
		},
		input(stream) {
			const transformer = {
				transform(transform: ImageTransform) {
					calls.transform.push(transform);
					return transformer;
				},
				async output(output: ImageOutputOptions): Promise<ImageTransformationResult> {
					calls.input.push(new Uint8Array(await new Response(stream).arrayBuffer()));
					calls.output.push(output);
					if (options.fail) throw new Error('ERROR 9500: service unavailable');
					const body = jpegOf(144, 144);
					return {
						contentType: () => 'image/jpeg',
						image: () => new Response(body).body!,
						response: () => new Response(body, { headers: { 'content-type': 'image/jpeg' } }),
					};
				},
			};
			return transformer as unknown as ImageTransformer;
		},
	};
	return { images, calls };
}

const idOf = (key: string) => key.slice('photos/'.length, -'.webp'.length);

describe('email thumbnails', () => {
	afterEach(() => vi.restoreAllMocks());

	it('derives the public path from the storage key', () => {
		const key = newPhotoKey();
		expect(EMAIL_THUMBNAIL.test(idOf(key))).toBe(true);
		expect(emailThumbnailPath(key)).toBe(`/photos/email/${idOf(key)}.jpg`);
	});

	it('makes a 144 px JPEG once, then finds it', async () => {
		const bucket = new MemoryBucket();
		const key = newPhotoKey();
		const original = webpOf(1600, 1067, 500);
		await bucket.put(key, original);
		const { images, calls } = recordingImages();
		const env = { PHOTOS: bucket.asBucket(), IMAGES: images };

		expect(await ensureEmailThumbnail(env, key)).toBe(true);
		expect(calls.input).toEqual([original]);
		expect(calls.transform).toEqual([{ width: 144, height: 144, fit: 'cover' }]);
		expect(calls.output).toEqual([{ format: 'image/jpeg', quality: 80 }]);
		const stored = bucket.objects.get(`email/${idOf(key)}.jpg`);
		expect(stored?.body).toEqual(jpegOf(144, 144));
		expect(stored?.contentType).toBe('image/jpeg');

		expect(await ensureEmailThumbnail(env, key)).toBe(true);
		expect(calls.transform).toHaveLength(1);
		expect(bucket.calls.put).toBe(2);
	});

	it('answers false, with a log and no exception, when Images fails', async () => {
		const bucket = new MemoryBucket();
		const key = newPhotoKey();
		await bucket.put(key, webpOf(1600, 1067));
		const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		expect(await ensureEmailThumbnail({ PHOTOS: bucket.asBucket(), IMAGES: recordingImages({ fail: true }).images }, key)).toBe(false);
		expect(bucket.objects.has(`email/${idOf(key)}.jpg`)).toBe(false);
		expect(logged.mock.calls.map((call) => JSON.parse(String(call[0])).event)).toEqual(['menu_email_thumbnail_failed']);
	});

	it('answers false without the bindings, without the original or with a foreign key', async () => {
		const bucket = new MemoryBucket();
		const key = newPhotoKey();
		const { images, calls } = recordingImages();
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		expect(await ensureEmailThumbnail({ PHOTOS: undefined, IMAGES: images }, key)).toBe(false);
		expect(await ensureEmailThumbnail({ PHOTOS: bucket.asBucket(), IMAGES: undefined }, key)).toBe(false);
		expect(await ensureEmailThumbnail({ PHOTOS: bucket.asBucket(), IMAGES: images }, key)).toBe(false);
		expect(await ensureEmailThumbnail({ PHOTOS: bucket.asBucket(), IMAGES: images }, 'photos/../x.webp')).toBe(false);
		expect(calls.transform).toEqual([]);
		expect(bucket.calls.put).toBe(0);
	});

	it('answers false when the bucket fails', async () => {
		const bucket = new MemoryBucket();
		const key = newPhotoKey();
		await bucket.put(key, webpOf(1600, 1067));
		bucket.failPut = true;
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		expect(await ensureEmailThumbnail({ PHOTOS: bucket.asBucket(), IMAGES: recordingImages().images }, key)).toBe(false);
	});
});
