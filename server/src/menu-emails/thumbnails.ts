import { PHOTO_KEY } from '../catalogue/photos/key.ts';
import type { Env } from '../env.ts';

/** Id of an email thumbnail: the 128 random bits of its photo's key (spec W24, section 5.4). */
export const EMAIL_THUMBNAIL = /^[A-Za-z0-9_-]{22}$/;

const SIDE = 144;

function idOf(storageKey: string): string | null {
	return PHOTO_KEY.test(storageKey) ? storageKey.slice('photos/'.length, -'.webp'.length) : null;
}

/** The R2 object of a thumbnail, beside the photos in the same bucket. */
export function emailThumbnailKey(id: string): string {
	return `email/${id}.jpg`;
}

/** The public route of the thumbnail of a photo, `photos/{id}.webp` → `/photos/email/{id}.jpg`. */
export function emailThumbnailPath(storageKey: string): string {
	const id = idOf(storageKey);
	if (!id) throw new Error('not a photo key');
	return `/photos/email/${id}.jpg`;
}

/**
 * The 144 px JPEG of a photo for the emails, made once (spec W24, section 5.4): true when it
 * exists or was just made, false without the bindings, the original or when Images fails.
 * Never throws: a failure only leaves that photo without a thumbnail in the email.
 */
export async function ensureEmailThumbnail(env: Pick<Env, 'PHOTOS' | 'IMAGES'>, storageKey: string): Promise<boolean> {
	const { PHOTOS, IMAGES } = env;
	const id = idOf(storageKey);
	if (!PHOTOS || !IMAGES || !id) return false;
	const key = emailThumbnailKey(id);
	try {
		if (await PHOTOS.head(key)) return true;
		const original = await PHOTOS.get(storageKey);
		if (!original) {
			console.error(JSON.stringify({ event: 'menu_email_thumbnail_failed', reason: 'original_missing' }));
			return false;
		}
		const result = await IMAGES.input(original.body)
			.transform({ width: SIDE, height: SIDE, fit: 'cover' })
			.output({ format: 'image/jpeg', quality: 80 });
		// R2 wants a stream of known length: the thumbnail is a few kilobytes, read whole.
		const body = await new Response(result.image()).arrayBuffer();
		await PHOTOS.put(key, body, { httpMetadata: { contentType: 'image/jpeg' } });
		return true;
	} catch {
		console.error(JSON.stringify({ event: 'menu_email_thumbnail_failed' }));
		return false;
	}
}
