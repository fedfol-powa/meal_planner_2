import { contract } from '@app/contract';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { router } from '../src/router.ts';
import { renderBringPage } from '../src/shopping/bring-page.ts';
import { hasDatabase, setupDatabase, type TestDatabase } from './support/db.ts';
import { createTestKeys } from './support/keys.ts';
import { testEnv } from './support/requests.ts';

/** The JSON-LD of a rendered page, read back as Bring! does. */
function jsonLd(html: string): any {
	const match = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
	if (!match) throw new Error('no JSON-LD');
	return JSON.parse(match[1]!);
}

describe('renderBringPage', () => {
	it('renders a Recipe named after the app, noindex, with the lines unchanged', () => {
		const lines = ['1 Limone', '200 g Farina </script><b>', 'Pane "di casa" & <altro>'];
		const html = renderBringPage(lines);
		const recipe = jsonLd(html);
		expect(recipe).toEqual({ '@context': 'https://schema.org', '@type': 'Recipe', name: 'Cosa si mangia', recipeIngredient: lines });
		expect(html).not.toContain('</script><b>');
		expect(html).toContain('\\u003c/script>');
		expect(html).toContain('<meta name="robots" content="noindex">');
	});
});

describe.skipIf(!hasDatabase)('GET /shopping-lists/<token>', () => {
	let db: TestDatabase;
	let app: ReturnType<typeof createApp>;

	beforeAll(async () => {
		db = await setupDatabase();
		const keys = await createTestKeys();
		app = createApp({ contract, router, keys: () => keys.keys, resourceName: 'test' });
	});
	afterAll(() => db?.close());

	async function temporaryList(items: string[]): Promise<string> {
		const user = await db.createUser();
		const familyId = await db.createFamily([{ userId: user.userId, role: 'family_admin' }]);
		const [{ token }] = await db.admin<{ token: string }[]>`
			insert into app.temporary_lists (family_id, items) values (${familyId}, ${db.admin.json(items)}) returning token`;
		return token;
	}

	const get = (path: string, method = 'GET') => app.fetch(new Request(`https://app.test${path}`, { method }), testEnv(db.appServerUrl));

	it('serves the page of a valid token as anon, without cache and noindex', async () => {
		const token = await temporaryList(['1 Limone', '100 g Zucchero']);
		const response = await get(`/shopping-lists/${token}`);
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
		expect(response.headers.get('x-robots-tag')).toBe('noindex');
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(jsonLd(await response.text()).recipeIngredient).toEqual(['1 Limone', '100 g Zucchero']);
	});

	it('answers 404 for an expired, unknown or malformed token', async () => {
		const expired = await temporaryList(['1 Limone']);
		await db.admin`update app.temporary_lists set expires_at = now() - interval '1 minute' where token = ${expired}`;
		for (const token of [expired, 'a'.repeat(48), 'not-a-token']) {
			const response = await get(`/shopping-lists/${token}`);
			expect(response.status, token).toBe(404);
			expect(response.headers.get('x-robots-tag')).toBe('noindex');
		}
	});

	it('answers 405 to every method but GET', async () => {
		const token = await temporaryList(['1 Limone']);
		for (const method of ['POST', 'HEAD', 'PUT']) {
			const response = await get(`/shopping-lists/${token}`, method);
			expect(response.status, method).toBe(405);
			expect(response.headers.get('allow')).toBe('GET');
		}
	});
});
