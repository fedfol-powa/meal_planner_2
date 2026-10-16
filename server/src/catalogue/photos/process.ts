import { PHOTO_INPUT_TYPES, PHOTO_MAX_INPUT_BYTES } from '@app/contract';
import { readLimited } from './download.ts';
import { PhotoError, PhotoServiceError } from './errors.ts';

/** The calls of the Images binding the photos use; a fake in the tests. */
export type PhotoImages = Pick<ImagesBinding, 'info' | 'input'>;

export interface ProcessedPhoto {
	body: Uint8Array;
	contentType: 'image/webp';
	width: number;
	height: number;
}

const MAX_SIDE = 1600;
const MIN_SHORT_SIDE = 400;
const MAX_OUTPUT_BYTES = 1024 * 1024;
/** Images error: the input is not an image. */
const NOT_AN_IMAGE = 9412;

function streamOf(bytes: Uint8Array): ReadableStream<Uint8Array> {
	return new Response(bytes).body!;
}

function isLimit(error: unknown): boolean {
	return new PhotoServiceError(error).limit;
}

/**
 * One transformation per upload, never on read (spec section 4): checks the input with the
 * free `info`, then a WebP of at most 1600 px on the long side, quality 80.
 */
export async function processPhoto(images: PhotoImages, bytes: Uint8Array): Promise<ProcessedPhoto> {
	if (bytes.byteLength > PHOTO_MAX_INPUT_BYTES) throw new PhotoError('photo_too_large');
	let info: ImageInfoResponse;
	try {
		info = await images.info(streamOf(bytes));
	} catch (error) {
		if (isLimit(error)) throw new PhotoServiceError(error);
		throw new PhotoError('photo_unreadable');
	}
	if (!(PHOTO_INPUT_TYPES as readonly string[]).includes(info.format) || !('width' in info)) throw new PhotoError('photo_type');
	if (Math.min(info.width, info.height) < MIN_SHORT_SIDE) throw new PhotoError('photo_too_small');

	let body: Uint8Array;
	try {
		const result = await images
			.input(streamOf(bytes))
			.transform({ width: MAX_SIDE, height: MAX_SIDE, fit: 'scale-down' })
			.output({ format: 'image/webp', quality: 80 });
		body = await readLimited(result.image(), MAX_OUTPUT_BYTES);
	} catch (error) {
		if (error instanceof PhotoError) throw error;
		if ((error as { code?: unknown } | null)?.code === NOT_AN_IMAGE) throw new PhotoError('photo_unreadable');
		throw new PhotoServiceError(error);
	}

	let out: ImageInfoResponse;
	try {
		out = await images.info(streamOf(body));
	} catch (error) {
		throw new PhotoServiceError(error);
	}
	if (!('width' in out)) throw new PhotoServiceError(new Error('the result has no size'));
	return { body, contentType: 'image/webp', width: out.width, height: out.height };
}
