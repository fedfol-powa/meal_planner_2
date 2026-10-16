import { PHOTO_MAX_INPUT_BYTES } from '@app/contract';
import { PhotoError } from './errors.ts';
import { allowedImageUrl } from './url.ts';

const USER_AGENT = 'CosaSiMangia/1.0 (recipe photo)';

/** Reads a body up to `maxBytes`, cancelling the stream past the limit. */
export async function readLimited(body: ReadableStream<Uint8Array>, maxBytes: number): Promise<Uint8Array> {
	const reader = body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > maxBytes) {
			await reader.cancel().catch(() => undefined);
			throw new PhotoError('photo_too_large');
		}
		chunks.push(value);
	}
	const bytes = new Uint8Array(total);
	let at = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, at);
		at += chunk.byteLength;
	}
	return bytes;
}

export interface DownloadDeps {
	fetch: typeof fetch;
	appHost: string;
	timeoutMs?: number;
	maxBytes?: number;
	maxRedirects?: number;
}

/**
 * Downloads an image from a public address: manual redirects, each checked again, one
 * timeout for the whole chain, the body read with a limit. No cookies or tokens are sent.
 */
export async function downloadImage(url: URL, deps: DownloadDeps): Promise<Uint8Array> {
	const { timeoutMs = 10_000, maxBytes = PHOTO_MAX_INPUT_BYTES, maxRedirects = 3 } = deps;
	const signal = AbortSignal.timeout(timeoutMs);
	let current = url;
	for (let redirects = 0; ; redirects++) {
		let response: Response;
		try {
			response = await deps.fetch(current.href, {
				method: 'GET',
				redirect: 'manual',
				headers: { accept: 'image/*', 'user-agent': USER_AGENT },
				signal,
			});
		} catch {
			log(current, 'unreachable');
			throw new PhotoError('photo_unreachable');
		}
		const location = response.headers.get('location');
		if (response.status >= 300 && response.status < 400 && location) {
			await response.body?.cancel().catch(() => undefined);
			if (redirects >= maxRedirects) {
				log(current, 'too_many_redirects');
				throw new PhotoError('photo_unreachable');
			}
			let target: string;
			try {
				target = new URL(location, current).href;
			} catch {
				log(current, 'redirect_malformed');
				throw new PhotoError('photo_url');
			}
			const next = allowedImageUrl(target, deps.appHost);
			if (!next) {
				log(current, 'redirect_refused');
				throw new PhotoError('photo_url');
			}
			current = next;
			continue;
		}
		if (!response.ok || !response.body) {
			await response.body?.cancel().catch(() => undefined);
			log(current, `status_${response.status}`);
			throw new PhotoError('photo_unreachable');
		}
		const declared = Number(response.headers.get('content-length'));
		if (declared > maxBytes) {
			await response.body.cancel().catch(() => undefined);
			log(current, 'too_large_declared');
			throw new PhotoError('photo_too_large');
		}
		try {
			return await readLimited(response.body, maxBytes);
		} catch (error) {
			if (error instanceof PhotoError) {
				log(current, 'too_large');
				throw error;
			}
			log(current, 'read_failed');
			throw new PhotoError('photo_unreachable');
		}
	}
}

/** Host and outcome only: never the full URL with its query. */
function log(url: URL, outcome: string) {
	console.warn(JSON.stringify({ event: 'photo_download_failed', host: url.hostname, outcome }));
}
