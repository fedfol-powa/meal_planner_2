import { contract } from '@app/contract';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { convertV4MiniflareOptions, Miniflare, Response as MiniflareResponse, type Request as MiniflareRequest } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { router } from '../src/router.ts';
import { hasDatabase, setupDatabase, type TestDatabase } from './support/db.ts';
import { createTestKeys } from './support/keys.ts';
import { testEnv } from './support/requests.ts';

interface AssetsConfig {
	not_found_handling: 'single-page-application' | 'none' | '404-page';
	run_worker_first: string[];
}

/** The assets section of the real wrangler.jsonc (line comments removed). */
async function assetsConfig(): Promise<{ compatibilityDate: string; assets: AssetsConfig }> {
	const text = await readFile(join(import.meta.dirname, '..', 'wrangler.jsonc'), 'utf8');
	const config = JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
	return { compatibilityDate: config.compatibility_date, assets: config.assets };
}

/**
 * Requests go through Cloudflare's asset routing (Miniflare, with the rules of wrangler.jsonc)
 * before reaching a user Worker that forwards them to the real app running in Node.
 */
describe.skipIf(!hasDatabase)('asset routing of wrangler.jsonc', () => {
	let db: TestDatabase;
	let mf: Miniflare;
	let directory: string;

	beforeAll(async () => {
		db = await setupDatabase();
		const keys = await createTestKeys();
		const app = createApp({ contract, router, keys: () => keys.keys, resourceName: 'test' });
		const { compatibilityDate, assets } = await assetsConfig();
		directory = await mkdtemp(join(tmpdir(), 'assets-'));
		await writeFile(join(directory, 'index.html'), '<!doctype html><title>SPA</title>');
		// Miniflare 5 (alpha, installed with wrangler) takes v4 options through its converter, which
		// drops the routing settings of the assets: they are set on the converted worker config.
		const options = convertV4MiniflareOptions({
			modules: true,
			script: 'export default { fetch: (request, env) => env.APP.fetch(request) };',
			compatibilityDate,
			assets: { directory, binding: 'ASSETS' },
			serviceBindings: {
				APP: async (request: MiniflareRequest) => {
					const response = await app.fetch(
						new Request(request.url, { method: request.method, headers: request.headers as unknown as HeadersInit }),
						testEnv(db.appServerUrl),
					);
					return new MiniflareResponse(await response.text(), {
						status: response.status,
						headers: Object.fromEntries(response.headers),
					});
				},
			},
		});
		Object.assign(options.workers[0]!.config.assets!, {
			notFoundHandling: assets.not_found_handling,
			runWorkerFirst: assets.run_worker_first,
			hasUserWorker: true,
		});
		mf = new Miniflare(options);
	});
	afterAll(async () => {
		await mf?.dispose();
		await db?.close();
		if (directory) await rm(directory, { recursive: true, force: true });
	});

	async function temporaryList(items: string[]): Promise<string> {
		const user = await db.createUser();
		const familyId = await db.createFamily([{ userId: user.userId, role: 'family_admin' }]);
		const [{ token }] = await db.admin<{ token: string }[]>`
			insert into app.temporary_lists (family_id, items) values (${familyId}, ${db.admin.json(items)}) returning token`;
		return token;
	}

	/** As Bring!'s servers fetch it, and as a browser navigation. */
	const fetchBoth = (path: string, method = 'GET') =>
		Promise.all([
			mf.dispatchFetch(`https://app.test${path}`, { method }),
			mf.dispatchFetch(`https://app.test${path}`, { method, headers: { 'sec-fetch-mode': 'navigate', accept: 'text/html' } }),
		]);

	it('still serves the SPA for the app routes', async () => {
		const response = await mf.dispatchFetch('https://app.test/menu/today', { headers: { 'sec-fetch-mode': 'navigate' } });
		expect(await response.text()).toContain('<title>SPA</title>');
	});

	it('reaches the Bring! page of a valid token, never the SPA', async () => {
		const token = await temporaryList(['1 Limone']);
		for (const response of await fetchBoth(`/shopping-lists/${token}`)) {
			expect(response.status).toBe(200);
			expect(response.headers.get('x-robots-tag')).toBe('noindex');
			expect(response.headers.get('cache-control')).toBe('no-store');
			expect(await response.text()).toContain('"recipeIngredient":["1 Limone"]');
		}
	});

	it('answers 404 for an expired token through the Worker, not the SPA fallback', async () => {
		const token = await temporaryList(['1 Limone']);
		await db.admin`update app.temporary_lists set expires_at = now() - interval '1 minute' where token = ${token}`;
		for (const response of await fetchBoth(`/shopping-lists/${token}`)) {
			expect(response.status).toBe(404);
			expect(response.headers.get('x-robots-tag')).toBe('noindex');
			expect(await response.text()).not.toContain('SPA');
		}
	});

	it('answers 405 to a method other than GET', async () => {
		const token = await temporaryList(['1 Limone']);
		for (const response of await fetchBoth(`/shopping-lists/${token}`, 'POST')) {
			expect(response.status).toBe(405);
			expect(response.headers.get('allow')).toBe('GET');
		}
	});
});
