import type { PhotoView } from '@app/contract';
import type { Tx } from '../../db.ts';
import { appError } from '../../errors.ts';
import type { OperationContext } from '../../pipeline.ts';
import { downloadImage } from './download.ts';
import { PhotoError, PhotoServiceError } from './errors.ts';
import { newPhotoKey, photoUrl } from './key.ts';
import { processPhoto } from './process.ts';
import { allowedImageUrl } from './url.ts';

type PhotoField = 'file' | 'imageUrl';

export interface SetPhotoInput {
	id: string;
	recipeId: string;
	/** The image field the errors point to. */
	field: PhotoField;
	/** Read only after the checks that need no bytes (recipe, repeated id, bindings). */
	bytes: () => Promise<Uint8Array>;
}

/** Absolute URLs for agents, who download them or pass them to the curator (spec section 5). */
export function originFor(context: OperationContext): string | undefined {
	return context.channel === 'mcp' ? context.origin : undefined;
}

async function currentPhoto(tx: Tx, recipeId: string, origin: string | undefined): Promise<PhotoView> {
	const [row] = await tx<{ id: string; storage_key: string; width: number; height: number }[]>`
		select id, storage_key, width, height from app.recipe_photos where recipe_id = ${recipeId} and removed_at is null`;
	return { recipeId, photo: row ? { id: row.id, url: photoUrl(row.storage_key, origin), width: row.width, height: row.height } : null };
}

/**
 * Locks the recipe row: two photo writes of the same recipe wait for each other (the last one
 * wins). `no key update` leaves meals free to reference the recipe meanwhile.
 */
async function lockRecipe(tx: Tx, recipeId: string): Promise<void> {
	const [row] = await tx`select 1 from app.recipes where id = ${recipeId} for no key update`;
	if (!row) throw appError('not_found');
}

function storageOf(context: OperationContext) {
	const { PHOTOS, IMAGES } = context.env;
	if (!PHOTOS || !IMAGES) {
		console.error(JSON.stringify({ event: 'photo_storage_not_configured', requestId: context.requestId }));
		throw appError('internal', { requestId: context.requestId });
	}
	return { photos: PHOTOS, images: IMAGES };
}

/**
 * Sets or replaces the photo of a recipe (spec section 5): the object is written to R2 before
 * the row, so a failed transaction leaves an orphan object, never a reference without one.
 */
export async function setRecipePhoto(context: OperationContext, input: SetPhotoInput): Promise<PhotoView> {
	const { tx } = context;
	const origin = originFor(context);
	await lockRecipe(tx, input.recipeId);
	const [repeated] = await tx<{ recipe_id: string }[]>`select recipe_id from app.recipe_photos where id = ${input.id}`;
	if (repeated) {
		if (repeated.recipe_id !== input.recipeId) throw appError('invalid', { issues: [{ path: ['id'], code: 'in_use' }] });
		return currentPhoto(tx, input.recipeId, origin);
	}
	const { photos, images } = storageOf(context);

	let processed;
	try {
		processed = await processPhoto(images, await input.bytes());
	} catch (error) {
		if (error instanceof PhotoError) throw appError('invalid', { issues: [{ path: [input.field], code: error.code }] });
		if (error instanceof PhotoServiceError) {
			const event = error.limit ? 'photo_images_limit' : 'photo_images_failed';
			console.error(JSON.stringify({ event, requestId: context.requestId }));
			throw appError('internal', { requestId: context.requestId });
		}
		throw error;
	}

	const key = newPhotoKey();
	await photos.put(key, processed.body, { httpMetadata: { contentType: processed.contentType } });
	await tx`
		update app.recipe_photos set removed_at = clock_timestamp(), removed_by = ${context.userId}
		where recipe_id = ${input.recipeId} and removed_at is null`;
	await tx`
		insert into app.recipe_photos (id, recipe_id, storage_key, content_type, width, height, bytes, created_by, channel)
		values (${input.id}, ${input.recipeId}, ${key}, ${processed.contentType}, ${processed.width}, ${processed.height},
			${processed.body.byteLength}, ${context.userId}, ${context.channel})`;
	return { recipeId: input.recipeId, photo: { id: input.id, url: photoUrl(key, origin), width: processed.width, height: processed.height } };
}

/** The bytes behind an agent's address, downloaded with the checks of spec section 5. */
export function bytesFromUrl(context: OperationContext, imageUrl: string): () => Promise<Uint8Array> {
	return async () => {
		const appHost = new URL(context.origin).hostname;
		const url = allowedImageUrl(imageUrl, appHost);
		if (!url) throw new PhotoError('photo_url');
		// A plain call: the Workers fetch refuses to run bound to another object.
		const fetcher = context.env.PHOTO_FETCH ?? ((request: RequestInfo | URL, init?: RequestInit) => fetch(request, init));
		return downloadImage(url, { fetch: fetcher as typeof fetch, appHost });
	};
}

/** Absolute state: without a current photo nothing is written. The object stays in the bucket. */
export async function removeRecipePhoto(context: OperationContext, recipeId: string): Promise<PhotoView> {
	const { tx } = context;
	await lockRecipe(tx, recipeId);
	await tx`
		update app.recipe_photos set removed_at = clock_timestamp(), removed_by = ${context.userId}
		where recipe_id = ${recipeId} and removed_at is null`;
	return { recipeId, photo: null };
}
