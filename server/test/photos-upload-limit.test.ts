import { contract, type Contract } from '@app/contract';
import { createORPCClient, ORPCError } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { ContractRouterClient } from '@orpc/contract';
import { OpenAPILink } from '@orpc/openapi-client/fetch';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { UPLOAD_BODY_LIMIT } from '../src/photos/upload-limit.ts';
import { setupActors, type Actor, type Actors } from './support/actors.ts';
import { hasDatabase } from './support/db.ts';
import { fakeImages, jpegOf, type FakeImages } from './support/images.ts';
import { MemoryBucket } from './support/r2.ts';

const buffered = vi.hoisted(() => ({ count: 0 }));
vi.mock('../src/photos/upload-limit.ts', async (original) => {
	const actual = await original<typeof import('../src/photos/upload-limit.ts')>();
	return {
		...actual,
		bufferUploadBody: (...args: Parameters<typeof actual.bufferUploadBody>) => (buffered.count++, actual.bufferUploadBody(...args)),
	};
});

const MiB = 1024 * 1024;
const CHUNK = 64 * 1024;
const FIXTURE = join(import.meta.dirname, '..', '..', 'web', 'src', 'api', 'fixtures', 'upload-too-large.rpc.json');
const TOO_LARGE = [{ path: ['file'], code: 'photo_too_large' }];

/** A body of `total` bytes in 64 KiB chunks, produced only when read. */
function chunkedBody(total: number, prefix: Uint8Array = new Uint8Array()) {
	const state = { produced: 0, cancelled: false };
	const stream = new ReadableStream<Uint8Array>(
		{
			pull(controller) {
				if (state.produced >= total) return controller.close();
				const chunk = state.produced === 0 && prefix.length ? prefix : new Uint8Array(Math.min(CHUNK, total - state.produced));
				state.produced += chunk.length;
				controller.enqueue(chunk);
			},
			cancel() {
				state.cancelled = true;
			},
		},
		{ highWaterMark: 0 },
	);
	return { stream, state };
}

const multipartHead = new TextEncoder().encode('--x\r\nContent-Disposition: form-data; name="0"; filename="a.jpg"\r\nContent-Type: image/jpeg\r\n\r\n');

describe.skipIf(!hasDatabase)('upload body limit', () => {
	let actors: Actors;
	let bucket: MemoryBucket;
	let images: FakeImages;
	let curator: Actor;
	let recipeId: string;
	beforeAll(async () => {
		actors = await setupActors();
		curator = await actors.user();
		await actors.db.grantGlobalRole(curator.userId, 'recipe_curator');
		[{ id: recipeId }] = await actors.db.admin<{ id: string }[]>`
			insert into app.recipes (slug, name) values (${`upload-limit-${crypto.randomUUID()}`}, '{"it-IT": "Bozza"}') returning id`;
	});
	afterAll(() => actors?.close());
	beforeEach(() => {
		bucket = new MemoryBucket();
		images = fakeImages();
		Object.assign(actors.env, { PHOTOS: bucket.asBucket(), IMAGES: images });
		buffered.count = 0;
	});

	const paths = () => [
		'/api/rpc/catalogue/uploadPhoto',
		'/api/rpc/catalogue/uploadPhoto/',
		`/api/catalogue/recipes/${recipeId}/photo/upload`,
		`/api/catalogue/recipes/${recipeId}/photo/upload/`,
	];

	const nothingProcessed = () => {
		expect(images.calls).toEqual({ info: 0, input: 0 });
		expect(bucket.calls.put).toBe(0);
	};

	it('refuses a declared oversized upload at once, on every upload path', async () => {
		for (const path of paths()) {
			const { stream, state } = chunkedBody(20 * MiB);
			const response = await actors.app.fetch(
				new Request(`https://app.test${path}`, {
					method: 'POST',
					headers: { 'content-type': 'multipart/form-data; boundary=x', 'content-length': String(20 * MiB) },
					body: stream,
					duplex: 'half',
				} as RequestInit),
				actors.env,
			);
			expect(response.status, path).toBe(413);
			expect(JSON.stringify(await response.json()), path).toContain('photo_too_large');
			expect(state.produced, path).toBe(0);
		}
		nothingProcessed();
	});

	it('stops an oversized upload while reading, on every upload path', async () => {
		for (const path of paths()) {
			const { stream, state } = chunkedBody(12 * MiB, multipartHead);
			const response = await actors.app.fetch(
				new Request(`https://app.test${path}`, {
					method: 'POST',
					headers: { 'content-type': 'multipart/form-data; boundary=x' },
					body: stream,
					duplex: 'half',
				} as RequestInit),
				actors.env,
			);
			expect(response.status, path).toBe(413);
			expect(JSON.stringify(await response.json()), path).toContain('photo_too_large');
			expect(state.cancelled, path).toBe(true);
			expect(state.produced, path).toBeLessThanOrEqual(UPLOAD_BODY_LIMIT + CHUNK);
		}
		nothingProcessed();
	});

	it('limits a body to an upload path that is not multipart', async () => {
		const { stream, state } = chunkedBody(12 * MiB);
		const response = await actors.app.fetch(
			new Request(`https://app.test/api/rpc/catalogue/uploadPhoto`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: stream,
				duplex: 'half',
			} as RequestInit),
			actors.env,
		);
		expect(response.status).toBe(413);
		expect(state.cancelled).toBe(true);
	});

	/** The link's fetch towards the app: with the length declared, or the body as a stream without it. */
	function transport(mode: 'declared' | 'streamed') {
		return async (request: Request) => {
			const bytes = new Uint8Array(await request.arrayBuffer());
			const headers = new Headers(request.headers);
			if (mode === 'declared') {
				headers.set('content-length', String(bytes.byteLength));
				return actors.app.fetch(new Request(request.url, { method: request.method, headers, body: bytes }), actors.env);
			}
			headers.delete('content-length');
			const body = new ReadableStream<Uint8Array>({
				start(controller) {
					for (let at = 0; at < bytes.byteLength; at += CHUNK) controller.enqueue(bytes.subarray(at, at + CHUNK));
					controller.close();
				},
			});
			return actors.app.fetch(new Request(request.url, { method: request.method, headers, body, duplex: 'half' } as RequestInit), actors.env);
		};
	}

	const rpc = (fetch: (request: Request) => Promise<Response>, token?: string) =>
		createORPCClient<ContractRouterClient<Contract>>(
			new RPCLink({ url: 'https://app.test/api/rpc', headers: () => (token ? { authorization: `Bearer ${token}` } : {}), fetch: (request) => fetch(request) }),
		);
	const openApi = (fetch: (request: Request) => Promise<Response>, token?: string) =>
		createORPCClient<ContractRouterClient<Contract>>(
			new OpenAPILink(contract, { url: 'https://app.test/api', headers: () => (token ? { authorization: `Bearer ${token}` } : {}), fetch: (request) => fetch(request) }),
		);
	const bigFile = (size: number) => {
		const bytes = new Uint8Array(size);
		bytes.set(jpegOf(1200, 800));
		return new File([bytes], 'photo.jpg', { type: 'image/jpeg' });
	};

	async function errorOf(promise: Promise<unknown>): Promise<ORPCError<string, any>> {
		const error = await promise.then(() => null, (e: unknown) => e);
		expect(error).toBeInstanceOf(ORPCError);
		return error as ORPCError<string, any>;
	}

	for (const mode of ['declared', 'streamed'] as const) {
		it(`the RPC client reads invalid with photo_too_large (${mode})`, async () => {
			const error = await errorOf(rpc(transport(mode)).catalogue.uploadPhoto({ id: crypto.randomUUID(), recipeId, file: bigFile(11 * MiB) }));
			expect({ status: error.status, code: error.code, issues: error.data?.issues }).toEqual({ status: 413, code: 'invalid', issues: TOO_LARGE });
			nothingProcessed();
		});

		it(`the OpenAPI client reads invalid with photo_too_large (${mode})`, async () => {
			const error = await errorOf(openApi(transport(mode)).catalogue.uploadPhoto({ id: crypto.randomUUID(), recipeId, file: bigFile(11 * MiB) }));
			expect({ status: error.status, code: error.code, issues: error.data?.issues }).toEqual({ status: 413, code: 'invalid', issues: TOO_LARGE });
			nothingProcessed();
		});
	}

	it('a multipart body to another api path is limited too', async () => {
		const client = rpc(transport('streamed'), curator.token);
		const error = await errorOf(
			client.catalogue.saveDraft({ draftId: crypto.randomUUID(), baseRevision: 1, content: { schemaVersion: 1, extra: bigFile(12 * MiB) } } as never),
		);
		expect({ status: error.status, code: error.code }).toEqual({ status: 413, code: 'invalid' });
	});

	it('a real upload of 9 MiB passes through both clients', async () => {
		const fetch = (request: Request) => actors.app.fetch(request, actors.env);
		const viaRpc = await rpc(fetch, curator.token).catalogue.uploadPhoto({ id: crypto.randomUUID(), recipeId, file: bigFile(9 * MiB) });
		expect(viaRpc.photo).not.toBeNull();
		const viaOpenApi = await openApi(fetch, curator.token).catalogue.uploadPhoto({ id: crypto.randomUUID(), recipeId, file: bigFile(9 * MiB) });
		expect(viaOpenApi.photo).not.toBeNull();
		expect(bucket.objects.size).toBe(2);
	});

	it('an ordinary JSON request is not buffered and answers as before', async () => {
		const fetch = (request: Request) => actors.app.fetch(request, actors.env);
		const overview = await rpc(fetch, curator.token).catalogue.overview({});
		expect(overview.drafts).toBeInstanceOf(Array);
		expect(buffered.count).toBe(0);
	});

	it('the RPC answer matches the web fixture', async () => {
		const response = await transport('declared')(
			new Request('https://app.test/api/rpc/catalogue/uploadPhoto', {
				method: 'POST',
				headers: { 'content-type': 'multipart/form-data; boundary=x' },
				body: new Uint8Array(UPLOAD_BODY_LIMIT + 1),
			}),
		);
		const actual = { status: response.status, body: await response.json() };
		if (process.env.UPDATE_FIXTURES === '1') await writeFile(FIXTURE, `${JSON.stringify(actual, null, '\t')}\n`);
		expect(actual).toEqual(JSON.parse(await readFile(FIXTURE, 'utf8')));
	});
});
