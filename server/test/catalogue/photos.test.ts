import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PHOTO_KEY } from '../../src/catalogue/photos/key.ts';
import { errorOf, type Actor } from '../support/actors.ts';
import { hasDatabase } from '../support/db.ts';
import { avifOf, fakeImages, gifOf, jpegOf, SVG, type FakeImages, type FakeImagesOptions } from '../support/images.ts';
import { MemoryBucket } from '../support/r2.ts';
import { mcp, toolBody } from '../support/requests.ts';
import { catalogueActors, completeContent, draftContent, type CatalogueActors } from './support.ts';

const jpegFile = (width = 1200, height = 800, bytes = jpegOf(width, height), type = 'image/jpeg') => new File([bytes], 'photo.jpg', { type });

describe.skipIf(!hasDatabase)('recipe photos', () => {
	let c: CatalogueActors;
	let bucket: MemoryBucket;
	let images: FakeImages;
	let fetched: string[];
	let answer: (url: string) => Response;
	beforeAll(async () => {
		c = await catalogueActors();
	});
	afterAll(() => c?.actors.close());
	beforeEach(() => {
		bucket = new MemoryBucket();
		useImages();
		fetched = [];
		answer = () => new Response(jpegOf(1200, 800), { headers: { 'content-type': 'image/jpeg' } });
		Object.assign(c.actors.env, {
			PHOTOS: bucket.asBucket(),
			PHOTO_FETCH: (async (input: RequestInfo | URL) => {
				fetched.push(String(input));
				return answer(String(input));
			}) as typeof fetch,
		});
	});
	afterEach(() => vi.restoreAllMocks());
	const db = () => c.actors.db.admin;

	function useImages(options: FakeImagesOptions = {}) {
		images = fakeImages(options);
		c.actors.env.IMAGES = images;
	}

	async function publishedRecipe(curator: Actor, name = 'Pasta con le sarde'): Promise<string> {
		const ingredientId = await c.ingredient(`${name} ingrediente`);
		const d = await curator.client.catalogue.createDraft({ id: crypto.randomUUID(), content: completeContent(name, ingredientId) });
		await curator.client.catalogue.publish({ draftId: d.draftId });
		return d.recipeId;
	}

	const rows = (recipeId: string) =>
		db()<{ id: string; storage_key: string; removed_at: Date | null; channel: string }[]>`
			select id, storage_key, removed_at, channel from app.recipe_photos where recipe_id = ${recipeId} order by created_at`;

	it('a member who is not a curator gets forbidden', async () => {
		const curator = await c.curator();
		const recipeId = await publishedRecipe(curator, 'Riso e piselli');
		const member = await c.member();
		const calls = [
			() => member.client.catalogue.uploadPhoto({ id: crypto.randomUUID(), recipeId, file: jpegFile() }),
			() => member.client.catalogue.setPhotoFromUrl({ id: crypto.randomUUID(), recipeId, imageUrl: 'https://ricette.example.it/a.jpg' }),
			() => member.client.catalogue.removePhoto({ recipeId }),
		];
		for (const call of calls) expect((await errorOf(call())).code).toBe('forbidden');
		expect(bucket.objects.size).toBe(0);
	});

	it('uploads, replaces and removes a photo', async () => {
		const curator = await c.curator();
		const recipeId = await publishedRecipe(curator, 'Melanzane alla parmigiana');
		const first = await curator.client.catalogue.uploadPhoto({ id: crypto.randomUUID(), recipeId, file: jpegFile(3000, 2000) });
		expect(first.recipeId).toBe(recipeId);
		expect(first.photo).toMatchObject({ width: 1600, height: 1067 });
		expect(first.photo!.url).toMatch(/^\/photos\/[A-Za-z0-9_-]{22}\.webp$/);
		expect(await rows(recipeId)).toMatchObject([{ id: first.photo!.id, removed_at: null, channel: 'web' }]);
		expect(bucket.objects.get(first.photo!.url.slice(1))?.contentType).toBe('image/webp');

		const second = await curator.client.catalogue.uploadPhoto({ id: crypto.randomUUID(), recipeId, file: jpegFile() });
		const afterReplace = await rows(recipeId);
		expect(afterReplace).toHaveLength(2);
		expect(afterReplace.filter((r) => r.removed_at === null).map((r) => r.id)).toEqual([second.photo!.id]);
		expect(bucket.objects.size).toBe(2);

		expect(await curator.client.catalogue.removePhoto({ recipeId })).toEqual({ recipeId, photo: null });
		expect((await rows(recipeId)).every((r) => r.removed_at !== null)).toBe(true);
		const [removed] = await db()`select removed_by from app.recipe_photos where id = ${second.photo!.id}`;
		expect(removed!.removed_by).toBe(curator.userId);
		// Nothing is ever deleted from the bucket.
		expect([...bucket.objects.keys()].sort()).toEqual([first.photo!.url.slice(1), second.photo!.url.slice(1)].sort());

		const before = await db()`select xmin from app.recipe_photos where recipe_id = ${recipeId} order by created_at`;
		const [{ version }] = await db()`select version from app.catalogue_state`;
		expect(await curator.client.catalogue.removePhoto({ recipeId })).toEqual({ recipeId, photo: null });
		expect(await db()`select xmin from app.recipe_photos where recipe_id = ${recipeId} order by created_at`).toEqual(before);
		// Nothing written: the copies of the recipe book on the devices stay valid.
		expect((await db()`select version from app.catalogue_state`)[0]!.version).toBe(version);
	});

	it('repeating the same id does no new work', async () => {
		const curator = await c.curator();
		const recipeId = await publishedRecipe(curator, 'Frittata di zucchine');
		const id = crypto.randomUUID();
		const first = await curator.client.catalogue.uploadPhoto({ id, recipeId, file: jpegFile() });
		const calls = { ...images.calls };
		const again = await curator.client.catalogue.uploadPhoto({ id, recipeId, file: jpegFile(2000, 2000) });
		expect(again).toEqual(first);
		expect(bucket.objects.size).toBe(1);
		expect(images.calls).toEqual(calls);
	});

	it('the same id for another recipe is invalid', async () => {
		const curator = await c.curator();
		const a = await publishedRecipe(curator, 'Pollo al limone');
		const b = await publishedRecipe(curator, 'Pollo alle olive');
		const id = crypto.randomUUID();
		await curator.client.catalogue.uploadPhoto({ id, recipeId: a, file: jpegFile() });
		const error = await errorOf(curator.client.catalogue.uploadPhoto({ id, recipeId: b, file: jpegFile() }));
		expect(error.code).toBe('invalid');
		expect(error.data.issues).toEqual([{ path: ['id'], code: 'in_use' }]);
	});

	it.each([
		['AVIF', avifOf(1200, 800), 'photo_type'],
		['SVG', SVG, 'photo_type'],
		['GIF', gifOf(1200, 800), 'photo_type'],
		['a small image', jpegOf(600, 300), 'photo_too_small'],
		['an unreadable file', new Uint8Array([1, 2, 3, 4]), 'photo_unreadable'],
	])('refuses %s', async (_name, bytes, code) => {
		const curator = await c.curator();
		const recipeId = await publishedRecipe(curator, `Rifiuto ${code} ${bytes.length}`);
		const error = await errorOf(curator.client.catalogue.uploadPhoto({ id: crypto.randomUUID(), recipeId, file: jpegFile(0, 0, bytes) }));
		expect(error.code).toBe('invalid');
		expect(error.data.issues).toEqual([{ path: ['file'], code }]);
		expect(await rows(recipeId)).toEqual([]);
		expect(bucket.objects.size).toBe(0);
	});

	it('refuses a file type outside JPEG, PNG and WebP in the contract', async () => {
		const curator = await c.curator();
		const recipeId = await publishedRecipe(curator, 'Torta di mele');
		const error = await errorOf(
			curator.client.catalogue.uploadPhoto({ id: crypto.randomUUID(), recipeId, file: jpegFile(0, 0, avifOf(1200, 800), 'image/avif') }),
		);
		expect(error.code).toBe('invalid');
		expect(error.data.issues).toEqual([{ path: ['file'], code: 'photo_type' }]);
	});

	it('the Images limit keeps the previous photo', async () => {
		const curator = await c.curator();
		const recipeId = await publishedRecipe(curator, 'Spezzatino');
		const first = await curator.client.catalogue.uploadPhoto({ id: crypto.randomUUID(), recipeId, file: jpegFile() });
		useImages({ fail: 'limit' });
		const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const error = await errorOf(curator.client.catalogue.uploadPhoto({ id: crypto.randomUUID(), recipeId, file: jpegFile() }));
		expect(error.code).toBe('internal');
		expect(logged.mock.calls.map((call) => JSON.parse(String(call[0])).event)).toContain('photo_images_limit');
		expect((await rows(recipeId)).map((r) => [r.id, r.removed_at])).toEqual([[first.photo!.id, null]]);
		expect(bucket.objects.size).toBe(1);

		useImages({ fail: 'service' });
		expect((await errorOf(curator.client.catalogue.uploadPhoto({ id: crypto.randomUUID(), recipeId, file: jpegFile() }))).code).toBe('internal');
		expect(logged.mock.calls.map((call) => JSON.parse(String(call[0])).event)).toContain('photo_images_failed');
		expect(await rows(recipeId)).toHaveLength(1);

		// The same in the first reading of the input: the service's fault, not the curator's image.
		logged.mockClear();
		useImages({ fail: 'info-service' });
		expect((await errorOf(curator.client.catalogue.uploadPhoto({ id: crypto.randomUUID(), recipeId, file: jpegFile() }))).code).toBe('internal');
		expect(logged.mock.calls.map((call) => JSON.parse(String(call[0])).event)).toContain('photo_images_failed');
		expect((await rows(recipeId)).map((r) => [r.id, r.removed_at])).toEqual([[first.photo!.id, null]]);
		expect(bucket.objects.size).toBe(1);
	});

	it('without the bindings the photo operations are internal', async () => {
		const curator = await c.curator();
		const recipeId = await publishedRecipe(curator, 'Insalata di farro');
		c.actors.env.PHOTOS = undefined;
		const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		expect((await errorOf(curator.client.catalogue.uploadPhoto({ id: crypto.randomUUID(), recipeId, file: jpegFile() }))).code).toBe('internal');
		expect(logged.mock.calls.map((call) => JSON.parse(String(call[0])).event)).toContain('photo_storage_not_configured');
	});

	describe('setPhotoFromUrl', () => {
		it('refuses an address that is not allowed', async () => {
			const curator = await c.curator();
			const recipeId = await publishedRecipe(curator, 'Zuppa di ceci');
			const error = await errorOf(curator.client.catalogue.setPhotoFromUrl({ id: crypto.randomUUID(), recipeId, imageUrl: 'http://ricette.example.it/a.jpg' }));
			expect(error.code).toBe('invalid');
			expect(error.data.issues).toEqual([{ path: ['imageUrl'], code: 'photo_url' }]);
			expect(fetched).toEqual([]);
		});

		it('an address that answers 404 is unreachable', async () => {
			const curator = await c.curator();
			const recipeId = await publishedRecipe(curator, 'Zuppa di lenticchie');
			answer = () => new Response('missing', { status: 404 });
			vi.spyOn(console, 'warn').mockImplementation(() => undefined);
			const error = await errorOf(curator.client.catalogue.setPhotoFromUrl({ id: crypto.randomUUID(), recipeId, imageUrl: 'https://ricette.example.it/a.jpg' }));
			expect(error.data.issues).toEqual([{ path: ['imageUrl'], code: 'photo_unreachable' }]);
		});

		it('a downloaded AVIF is refused', async () => {
			const curator = await c.curator();
			const recipeId = await publishedRecipe(curator, 'Zuppa di farro');
			answer = () => new Response(avifOf(1200, 800));
			const error = await errorOf(curator.client.catalogue.setPhotoFromUrl({ id: crypto.randomUUID(), recipeId, imageUrl: 'https://ricette.example.it/a.avif' }));
			expect(error.data.issues).toEqual([{ path: ['imageUrl'], code: 'photo_type' }]);
		});

		it('sets the photo and answers an absolute URL to an agent', async () => {
			const agent = await c.curator({ agent: true });
			const recipeId = await publishedRecipe(agent, 'Pesto alla genovese');
			const view = await agent.client.catalogue.setPhotoFromUrl({ id: crypto.randomUUID(), recipeId, imageUrl: 'https://ricette.example.it/pesto.jpg' });
			expect(fetched).toEqual(['https://ricette.example.it/pesto.jpg']);
			expect(view.photo!.url).toMatch(/^https:\/\/app\.test\/photos\/[A-Za-z0-9_-]{22}\.webp$/);
			expect(new URL(view.photo!.url).pathname.slice(1)).toMatch(PHOTO_KEY);
			expect(await rows(recipeId)).toMatchObject([{ channel: 'mcp', removed_at: null }]);
		});
	});

	it('concurrent replacements leave one current photo', async () => {
		const curator = await c.curator();
		const recipeId = await publishedRecipe(curator, 'Pasta alla norma');
		const results = await Promise.allSettled([
			curator.client.catalogue.uploadPhoto({ id: crypto.randomUUID(), recipeId, file: jpegFile() }),
			curator.client.catalogue.uploadPhoto({ id: crypto.randomUUID(), recipeId, file: jpegFile() }),
			curator.client.catalogue.uploadPhoto({ id: crypto.randomUUID(), recipeId, file: jpegFile() }),
		]);
		expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled', 'fulfilled']);
		const all = await rows(recipeId);
		expect(all).toHaveLength(3);
		expect(all.filter((r) => r.removed_at === null)).toHaveLength(1);
	});

	it('a failed transaction leaves an orphan object, never a row', async () => {
		const curator = await c.curator();
		const recipeId = await publishedRecipe(curator, 'Crostata');
		await db().unsafe(`
			create function public.test_fail_photo() returns trigger language plpgsql as $$ begin raise exception 'forced failure'; end; $$;
			create trigger test_fail_photo before insert on app.recipe_photos for each row execute function public.test_fail_photo();`);
		try {
			vi.spyOn(console, 'error').mockImplementation(() => undefined);
			expect((await errorOf(curator.client.catalogue.uploadPhoto({ id: crypto.randomUUID(), recipeId, file: jpegFile() }))).code).toBe('internal');
		} finally {
			await db().unsafe('drop trigger test_fail_photo on app.recipe_photos; drop function public.test_fail_photo();');
		}
		expect(await rows(recipeId)).toEqual([]);
		expect(bucket.objects.size).toBe(1);
	});

	it('an unknown recipe is not_found', async () => {
		const curator = await c.curator();
		expect((await errorOf(curator.client.catalogue.uploadPhoto({ id: crypto.randomUUID(), recipeId: crypto.randomUUID(), file: jpegFile() }))).code).toBe(
			'not_found',
		);
		expect((await errorOf(curator.client.catalogue.removePhoto({ recipeId: crypto.randomUUID() }))).code).toBe('not_found');
		expect(bucket.objects.size).toBe(0);
	});

	it('a draft can get a photo', async () => {
		const curator = await c.curator();
		const d = await curator.client.catalogue.createDraft({ id: crypto.randomUUID(), content: draftContent('Bozza con foto') });
		const view = await curator.client.catalogue.uploadPhoto({ id: crypto.randomUUID(), recipeId: d.recipeId, file: jpegFile() });
		expect(view.photo).not.toBeNull();
	});

	it('MCP has tools to set and remove the photo, not to upload a file', async () => {
		const agent = await c.curator({ agent: true });
		const listed = await mcp(c.actors.app, c.actors.env, agent.token, 'tools/list');
		const names = listed.body.result.tools.map((t: { name: string }) => t.name);
		expect(names).toContain('catalogue_setPhotoFromUrl');
		expect(names).toContain('catalogue_removePhoto');
		expect(names).not.toContain('catalogue_uploadPhoto');

		const recipeId = await publishedRecipe(agent, 'Pizza margherita');
		const result = await mcp(c.actors.app, c.actors.env, agent.token, 'tools/call', {
			name: 'catalogue_setPhotoFromUrl',
			arguments: { id: crypto.randomUUID(), recipeId, imageUrl: 'https://ricette.example.it/pizza.jpg' },
		});
		expect(toolBody(result).photo.url).toMatch(/^https:\/\/app\.test\/photos\//);
	});

	describe('views', () => {
		async function familyMember() {
			const member = await c.member();
			const familyId = await c.actors.db.createFamily([{ userId: member.userId, role: 'family_admin' }]);
			return { member, familyId };
		}

		it('the recipe book and the recipe card carry the photo URL', async () => {
			const curator = await c.curator();
			const tag = crypto.randomUUID().slice(0, 8);
			const recipeId = await publishedRecipe(curator, `Gnocchi al pomodoro ${tag}`);
			const without = await publishedRecipe(curator, `Gnocchi al burro ${tag}`);
			const { member, familyId } = await familyMember();
			const before = await member.client.recipes.get({ familyId, recipeId });
			expect(before.unchanged).toBe(false);
			if (before.unchanged) return;
			expect(before.data.recipe.photoUrl).toBeNull();

			const uploaded = await curator.client.catalogue.uploadPhoto({ id: crypto.randomUUID(), recipeId, file: jpegFile() });
			// A new photo moves the catalogue counter: the copy on the device is renewed.
			const after = await member.client.recipes.get({ familyId, recipeId, knownVersion: before.version });
			expect(after.unchanged).toBe(false);
			if (after.unchanged) return;
			expect(after.data.recipe.photoUrl).toBe(uploaded.photo!.url);

			const found = await member.client.recipes.search({ familyId, query: { text: tag } });
			if (found.unchanged) throw new Error('unexpected unchanged');
			const urls = Object.fromEntries(found.data.items.map((item) => [item.recipe.id, item.recipe.photoUrl]));
			expect(urls[recipeId]).toBe(uploaded.photo!.url);
			expect(urls[without]).toBeNull();
		});

		it('curators and agents see the photo of recipes and drafts, absolute through MCP', async () => {
			const agent = await c.curator({ agent: true });
			const name = `Calzone ${crypto.randomUUID().slice(0, 8)}`;
			const recipeId = await publishedRecipe(agent, name);
			const set = await agent.client.catalogue.setPhotoFromUrl({ id: crypto.randomUUID(), recipeId, imageUrl: 'https://ricette.example.it/c.jpg' });
			const found = await agent.client.catalogue.searchRecipes({ text: name });
			if (found.unchanged) throw new Error('unexpected unchanged');
			expect(found.data.items.map((item) => item.photoUrl)).toEqual([set.photo!.url]);
			expect(set.photo!.url.startsWith('https://app.test/photos/')).toBe(true);

			const d = await agent.client.catalogue.createDraft({ id: crypto.randomUUID(), content: draftContent('Bozza foto agente') });
			expect((await agent.client.catalogue.getDraft({ draftId: d.draftId })).photoUrl).toBeNull();
			const draftPhoto = await agent.client.catalogue.setPhotoFromUrl({ id: crypto.randomUUID(), recipeId: d.recipeId, imageUrl: 'https://ricette.example.it/d.jpg' });
			expect((await agent.client.catalogue.getDraft({ draftId: d.draftId })).photoUrl).toBe(draftPhoto.photo!.url);

			const webCurator = await c.curator();
			const fromWeb = await webCurator.client.catalogue.searchRecipes({ text: name });
			if (fromWeb.unchanged) throw new Error('unexpected unchanged');
			expect(fromWeb.data.items[0]!.photoUrl).toBe(new URL(set.photo!.url).pathname);
		});
	});

	it('the guide explains photos', async () => {
		const curator = await c.curator();
		const { guide } = await curator.client.catalogue.getGuide({});
		expect(guide).toContain('catalogue_setPhotoFromUrl');
		expect(guide).toContain('catalogue_removePhoto');
	});
});
