/** Object keys of the photo bucket: 128 random bits, never chosen by the client (spec section 3). */
export const PHOTO_KEY = /^photos\/[A-Za-z0-9_-]{22}\.webp$/;

export function newPhotoKey(): string {
	const bits = crypto.getRandomValues(new Uint8Array(16));
	const base64url = btoa(String.fromCharCode(...bits)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
	return `photos/${base64url}.webp`;
}

/** The public route of a photo. */
export function photoPath(key: string): string {
	return `/${key}`;
}

/** Relative in the app; absolute with an origin, for agents. */
export function photoUrl(key: string, origin?: string): string {
	return origin ? new URL(photoPath(key), origin).href : photoPath(key);
}
