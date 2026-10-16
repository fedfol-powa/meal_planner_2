import { PHOTO_KEY } from '../catalogue/photos/key.ts';
import { withDb } from '../db.ts';
import type { Env } from '../env.ts';

const errorResponse = (code: 'not_found' | 'rate_limited', status: number, message: string) =>
	Response.json({ code, status, message }, { status });
const notFound = () => errorResponse('not_found', 404, 'Not found');

/**
 * Public route of the recipe photos, `/photos/<key>` (spec W12, section 3): no token, as an
 * `<img>` sends none. Keys are 128 random bits; only current photos are served, so a removed
 * one is gone from here at once. No HTTP cache: the service worker keeps the photos seen.
 */
export async function servePhoto(request: Request, env: Env, key: string): Promise<Response> {
	if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405, headers: { allow: 'GET, HEAD' } });
	if (!(await env.PHOTO_READ_LIMIT.limit({ key: request.headers.get('cf-connecting-ip') ?? 'unknown' })).success) {
		return errorResponse('rate_limited', 429, 'Too many requests');
	}
	if (!PHOTO_KEY.test(key) || !env.PHOTOS) return notFound();
	const [row] = await withDb(env.HYPERDRIVE.connectionString, { kind: 'anon' }, (tx) =>
		tx<{ content_type: string }[]>`select content_type from app.served_photo(${key})`,
	);
	if (!row) return notFound();
	const object = await env.PHOTOS.get(key);
	if (!object) {
		console.error(JSON.stringify({ event: 'photo_object_missing' }));
		return notFound();
	}
	const headers = {
		'content-type': row.content_type,
		'cache-control': 'private, no-store',
		'x-content-type-options': 'nosniff',
		'content-security-policy': "default-src 'none'; sandbox",
		'cross-origin-resource-policy': 'same-origin',
		etag: object.httpEtag,
	};
	if (request.method === 'HEAD') {
		await object.body.cancel();
		return new Response(null, { headers: { ...headers, 'content-length': String(object.size) } });
	}
	return new Response(object.body, { headers });
}
