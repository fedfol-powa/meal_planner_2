import { withDb } from '../db.ts';
import type { Env } from '../env.ts';
import { EMAIL_THUMBNAIL, emailThumbnailKey } from '../menu-emails/thumbnails.ts';

const errorResponse = (code: 'not_found' | 'rate_limited', status: number, message: string) =>
	Response.json({ code, status, message }, { status });
const notFound = () => errorResponse('not_found', 404, 'Not found');

/**
 * Public route of the email thumbnails, `/photos/email/{id}.jpg` (spec W24, section 5.4): served
 * only while `photos/{id}.webp` is a current photo. Unlike `/photos/*`, a day of public cache and
 * readable from other origins, for the mail clients and their proxies.
 */
export async function serveEmailThumbnail(request: Request, env: Env, id: string): Promise<Response> {
	if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405, headers: { allow: 'GET, HEAD' } });
	if (!(await env.PHOTO_READ_LIMIT.limit({ key: request.headers.get('cf-connecting-ip') ?? 'unknown' })).success) {
		return errorResponse('rate_limited', 429, 'Too many requests');
	}
	if (!EMAIL_THUMBNAIL.test(id) || !env.PHOTOS) return notFound();
	const [row] = await withDb(env.HYPERDRIVE.connectionString, { kind: 'anon' }, (tx) =>
		tx<{ content_type: string }[]>`select content_type from app.served_photo(${`photos/${id}.webp`})`,
	);
	if (!row) return notFound();
	const object = await env.PHOTOS.get(emailThumbnailKey(id));
	if (!object) return notFound();
	const headers = {
		'content-type': 'image/jpeg',
		'cache-control': 'public, max-age=86400',
		'x-content-type-options': 'nosniff',
		'content-security-policy': "default-src 'none'; sandbox",
		'cross-origin-resource-policy': 'cross-origin',
		etag: object.httpEtag,
	};
	if (request.method === 'HEAD') {
		await object.body.cancel();
		return new Response(null, { headers: { ...headers, 'content-length': String(object.size) } });
	}
	return new Response(object.body, { headers });
}
