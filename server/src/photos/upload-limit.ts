import { ORPCError } from '@orpc/server';
import { readLimited } from '../catalogue/photos/download.ts';
import { PhotoError } from '../catalogue/photos/errors.ts';
import type { RequestContext } from '../pipeline.ts';

/** 10 MiB of file plus 64 KiB for the multipart envelope (spec W12, section 5). */
export const UPLOAD_BODY_LIMIT = 10 * 1024 * 1024 + 64 * 1024;

const UPLOAD_PATHS = [/^\/api\/rpc\/catalogue\/uploadPhoto$/, /^\/api\/catalogue\/recipes\/[^/]+\/photo\/upload$/];

/**
 * Requests whose body is read here, with the limit, before oRPC (which keeps files in memory)
 * and before the token: every multipart body under /api/, whatever the path, and any body
 * sent to the paths of uploadPhoto, trailing slashes removed.
 */
export function needsUploadLimit(request: Request, pathname: string): boolean {
	if (!pathname.startsWith('/api/')) return false;
	if ((request.headers.get('content-type') ?? '').toLowerCase().startsWith('multipart/form-data')) return true;
	const path = pathname.replace(/\/+$/, '');
	return UPLOAD_PATHS.some((pattern) => pattern.test(path));
}

/**
 * Reads the body up to `maxBytes`, never trusting Content-Length: a declared length over the
 * limit is refused unread, a longer stream is cancelled. Too large: the request goes on without
 * a body, for the interceptor to refuse; otherwise with the bytes read.
 */
export async function bufferUploadBody(request: Request, maxBytes: number): Promise<{ request: Request; tooLarge: boolean }> {
	const withoutBody = () => {
		const headers = new Headers(request.headers);
		headers.delete('content-length');
		headers.delete('content-type');
		return { request: new Request(request.url, { method: request.method, headers }), tooLarge: true };
	};
	if (Number(request.headers.get('content-length')) > maxBytes) {
		await request.body?.cancel().catch(() => undefined);
		return withoutBody();
	}
	if (!request.body) return { request, tooLarge: false };
	try {
		const bytes = await readLimited(request.body, maxBytes);
		return { request: new Request(request, { body: bytes }), tooLarge: false };
	} catch (error) {
		if (error instanceof PhotoError) return withoutBody();
		throw error;
	}
}

/**
 * First interceptor of both handlers: an upload over the limit becomes `invalid` 413 with
 * `photo_too_large`, serialized by oRPC in the format of each transport, before any decoding.
 */
export async function rejectOversizedUpload<T>(options: { context: RequestContext; next: () => Promise<T> }): Promise<T> {
	if (options.context.uploadTooLarge) {
		throw new ORPCError('invalid', { status: 413, data: { issues: [{ path: ['file'], code: 'photo_too_large' }] } });
	}
	return options.next();
}
