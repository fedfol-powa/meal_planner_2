import { contract } from '@app/contract';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.ts';
import { newPhotoKey } from '../src/catalogue/photos/key.ts';
import type { Env, RateLimiter } from '../src/env.ts';
import { router } from '../src/router.ts';
import { hasDatabase, setupDatabase, type TestDatabase } from './support/db.ts';
import { jpegOf, webpOf } from './support/images.ts';
import { createTestKeys } from './support/keys.ts';
import { MemoryBucket } from './support/r2.ts';
import { refuseAll, testEnv } from './support/requests.ts';

const HEADERS = {
	'content-type': 'image/webp',
	'cache-control': 'private, no-store',
	'x-content-type-options': 'nosniff',
	'content-security-policy': "default-src 'none'; sandbox",
	'cross-origin-resource-policy': 'same-origin',
};

describe('photo route without a database', () => {
	it('answers 404 to a malformed key without reaching the database', async () => {
		const keys = await createTestKeys();
		const app = createApp({ contract, router, keys: () => keys.keys, resourceName: 'test' });
		const bucket = new MemoryBucket();
		// testEnv() points at a database nobody listens on: any access would be a 500.
		const env = { ...testEnv(), PHOTOS: bucket.asBucket() };
		for (const path of ['/photos/x.webp', `/photos/${'a'.repeat(22)}.webp/more`, '/photos/%2E%2E%2Fsecret', `/photos/${'a'.repeat(22)}.png`, '/photos/']) {
			const response = await app.fetch(new Request(`https://app.test${path}`), env);
			expect(response.status, path).toBe(404);
			expect(await response.json()).toMatchObject({ code: 'not_found' });
		}
		expect(bucket.calls.get).toBe(0);
	});

	it('answers 429 when the limiter refuses, before anything else', async () => {
		const keys = await createTestKeys();
		const app = createApp({ contract, router, keys: () => keys.keys, resourceName: 'test' });
		const limited: string[] = [];
		const limiter: RateLimiter = { limit: async ({ key }) => (limited.push(key), refuseAll.limit({ key })) };
		const response = await app.fetch(
			new Request(`https://app.test/${newPhotoKey()}`, { headers: { 'cf-connecting-ip': '203.0.113.9' } }),
			{ ...testEnv(), PHOTO_READ_LIMIT: limiter },
		);
		expect(response.status).toBe(429);
		expect(await response.json()).toMatchObject({ code: 'rate_limited' });
		expect(limited).toEqual(['203.0.113.9']);
	});
});

const EMAIL_HEADERS = {
	'content-type': 'image/jpeg',
	'cache-control': 'public, max-age=86400',
	'x-content-type-options': 'nosniff',
	'cross-origin-resource-policy': 'cross-origin',
};

describe('email thumbnail route without a database', () => {
	it('answers 404 to a malformed id without reaching the database', async () => {
		const keys = await createTestKeys();
		const app = createApp({ contract, router, keys: () => keys.keys, resourceName: 'test' });
		const bucket = new MemoryBucket();
		const env = { ...testEnv(), PHOTOS: bucket.asBucket() };
		const paths = [
			'/photos/email/%2E%2E%2Fx.jpg',
			'/photos/email/..%2Fx.jpg',
			`/photos/email/${'a'.repeat(21)}.jpg`,
			`/photos/email/${'a'.repeat(23)}.jpg`,
			`/photos/email/${'a'.repeat(22)}.webp`,
			`/photos/email/${'a'.repeat(22)}.jpg/more`,
			'/photos/email/',
		];
		for (const path of paths) {
			const response = await app.fetch(new Request(`https://app.test${path}`), env);
			expect(response.status, path).toBe(404);
			expect(await response.json()).toMatchObject({ code: 'not_found' });
		}
		expect(bucket.calls.get).toBe(0);
	});

	it('answers 429 when the limiter refuses, and 405 to other methods', async () => {
		const keys = await createTestKeys();
		const app = createApp({ contract, router, keys: () => keys.keys, resourceName: 'test' });
		const limited: string[] = [];
		const limiter: RateLimiter = { limit: async ({ key }) => (limited.push(key), refuseAll.limit({ key })) };
		const path = `https://app.test/photos/email/${'a'.repeat(22)}.jpg`;
		const response = await app.fetch(new Request(path, { headers: { 'cf-connecting-ip': '203.0.113.9' } }), { ...testEnv(), PHOTO_READ_LIMIT: limiter });
		expect(response.status).toBe(429);
		expect(await response.json()).toMatchObject({ code: 'rate_limited' });
		expect(limited).toEqual(['203.0.113.9']);
		const post = await app.fetch(new Request(path, { method: 'POST' }), testEnv());
		expect(post.status).toBe(405);
		expect(post.headers.get('allow')).toBe('GET, HEAD');
	});
});

describe.skipIf(!hasDatabase)('photo route', () => {
	let db: TestDatabase;
	let app: ReturnType<typeof createApp>;
	let env: Env;
	let bucket: MemoryBucket;
	let recipeId: string;
	beforeAll(async () => {
		db = await setupDatabase();
		const keys = await createTestKeys();
		app = createApp({ contract, router, keys: () => keys.keys, resourceName: 'test' });
		[{ id: recipeId }] = await db.admin<{ id: string }[]>`
			insert into app.recipes (slug, name) values (${`photo-route-${crypto.randomUUID()}`}, '{"it-IT": "Bozza"}') returning id`;
	});
	afterAll(() => db?.close());
	beforeEach(() => {
		bucket = new MemoryBucket();
		env = { ...testEnv(db.appServerUrl), PHOTOS: bucket.asBucket() };
	});

	/** The new current photo of the recipe (the previous one is replaced): its row and, unless told otherwise, its object. */
	async function photo(options: { object?: boolean } = {}): Promise<{ key: string; body: Uint8Array }> {
		const key = newPhotoKey();
		const body = webpOf(1600, 1067, 500);
		await db.admin`update app.recipe_photos set removed_at = clock_timestamp() where recipe_id = ${recipeId} and removed_at is null`;
		await db.admin`
			insert into app.recipe_photos (id, recipe_id, storage_key, content_type, width, height, bytes, channel)
			values (${crypto.randomUUID()}, ${recipeId}, ${key}, 'image/webp', 1600, 1067, ${body.byteLength}, 'web')`;
		if (options.object !== false) await bucket.put(key, body, { httpMetadata: { contentType: 'image/webp' } });
		return { key, body };
	}

	it('serves a current photo without a token, with no HTTP cache', async () => {
		const { key, body } = await photo();
		const response = await app.fetch(new Request(`https://app.test/${key}`), env);
		expect(response.status).toBe(200);
		expect(Object.fromEntries([...response.headers].filter(([name]) => name in HEADERS))).toEqual(HEADERS);
		expect(response.headers.get('etag')).toBeTruthy();
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(body);
	});

	it('answers HEAD without a body and refuses other methods', async () => {
		const { key } = await photo();
		const head = await app.fetch(new Request(`https://app.test/${key}`, { method: 'HEAD' }), env);
		expect(head.status).toBe(200);
		expect(head.headers.get('cache-control')).toBe('private, no-store');
		expect(head.body).toBeNull();
		const post = await app.fetch(new Request(`https://app.test/${key}`, { method: 'POST' }), env);
		expect(post.status).toBe(405);
		expect(post.headers.get('allow')).toBe('GET, HEAD');
	});

	it('a removed photo is not served any more, though its object stays', async () => {
		const { key } = await photo();
		await photo();
		bucket.calls.get = 0;
		const response = await app.fetch(new Request(`https://app.test/${key}`), env);
		expect(response.status).toBe(404);
		expect(bucket.objects.has(key)).toBe(true);
		expect(bucket.calls.get).toBe(0);
	});

	it('an unknown key is 404', async () => {
		expect((await app.fetch(new Request(`https://app.test/${newPhotoKey()}`), env)).status).toBe(404);
	});

	it('a missing object is 404 and logged', async () => {
		const { key } = await photo({ object: false });
		const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const response = await app.fetch(new Request(`https://app.test/${key}`), env);
		expect(response.status).toBe(404);
		expect(logged.mock.calls.map((call) => JSON.parse(String(call[0])).event)).toContain('photo_object_missing');
		logged.mockRestore();
	});

	it('without the bucket the route is 404', async () => {
		const { key } = await photo();
		expect((await app.fetch(new Request(`https://app.test/${key}`), { ...env, PHOTOS: undefined })).status).toBe(404);
	});

	describe('email thumbnails', () => {
		const thumbnailOf = (key: string) => key.replace(/^photos\/(.+)\.webp$/, 'email/$1.jpg');
		const pathOf = (key: string) => key.replace(/^photos\/(.+)\.webp$/, '/photos/email/$1.jpg');

		it('serves the thumbnail of a current photo, cached and readable from other origins', async () => {
			const { key } = await photo();
			const thumbnail = jpegOf(144, 144);
			await bucket.put(thumbnailOf(key), thumbnail, { httpMetadata: { contentType: 'image/jpeg' } });
			const response = await app.fetch(new Request(`https://app.test${pathOf(key)}`), env);
			expect(response.status).toBe(200);
			expect(Object.fromEntries([...response.headers].filter(([name]) => name in EMAIL_HEADERS))).toEqual(EMAIL_HEADERS);
			expect(new Uint8Array(await response.arrayBuffer())).toEqual(thumbnail);
		});

		it('a removed photo has no thumbnail any more', async () => {
			const { key } = await photo();
			await bucket.put(thumbnailOf(key), jpegOf(144, 144));
			await photo();
			bucket.calls.get = 0;
			expect((await app.fetch(new Request(`https://app.test${pathOf(key)}`), env)).status).toBe(404);
			expect(bucket.calls.get).toBe(0);
		});

		it('a photo without a thumbnail, an unknown id or no bucket is 404', async () => {
			const { key } = await photo();
			expect((await app.fetch(new Request(`https://app.test${pathOf(key)}`), env)).status).toBe(404);
			expect((await app.fetch(new Request(`https://app.test${pathOf(newPhotoKey())}`), env)).status).toBe(404);
			await bucket.put(thumbnailOf(key), jpegOf(144, 144));
			expect((await app.fetch(new Request(`https://app.test${pathOf(key)}`), { ...env, PHOTOS: undefined })).status).toBe(404);
		});
	});
});
