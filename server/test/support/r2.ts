/** The R2 calls of the export and of the photos, in memory. Pages of two objects exercise the list cursor. */
export class MemoryBucket {
	objects = new Map<string, { body: Uint8Array; customMetadata: Record<string, string>; contentType?: string }>();
	failPut = false;
	failDelete = false;
	pageSize = 2;
	calls = { put: 0, get: 0, head: 0 };

	async put(
		key: string,
		value: Blob | Uint8Array | ArrayBuffer,
		options?: { customMetadata?: Record<string, string>; httpMetadata?: { contentType?: string } },
	) {
		this.calls.put++;
		if (this.failPut) throw new Error('put failed');
		const body = value instanceof Blob ? new Uint8Array(await value.arrayBuffer()) : new Uint8Array(value instanceof ArrayBuffer ? value : value.slice());
		this.objects.set(key, { body, customMetadata: options?.customMetadata ?? {}, contentType: options?.httpMetadata?.contentType });
		return { key };
	}

	async get(key: string) {
		this.calls.get++;
		const object = this.objects.get(key);
		if (!object) return null;
		return {
			key,
			size: object.body.byteLength,
			httpEtag: `"etag-${key.length}-${object.body.byteLength}"`,
			body: new Response(object.body).body!,
		};
	}

	async head(key: string) {
		this.calls.head++;
		const object = this.objects.get(key);
		return object ? { key, size: object.body.byteLength } : null;
	}

	async list(options: { prefix?: string; cursor?: string; limit?: number } = {}) {
		const limit = Math.min(options.limit ?? this.pageSize, this.pageSize);
		const keys = [...this.objects.keys()].filter((k) => k.startsWith(options.prefix ?? '')).sort();
		const start = options.cursor ? Number(options.cursor) : 0;
		const truncated = start + limit < keys.length;
		return {
			objects: keys.slice(start, start + limit).map((key) => ({ key })),
			truncated,
			cursor: truncated ? String(start + limit) : undefined,
			delimitedPrefixes: [],
		};
	}

	async delete(keys: string | string[]) {
		if (this.failDelete) throw new Error('delete failed');
		for (const key of [keys].flat()) this.objects.delete(key);
	}

	asBucket(): R2Bucket {
		return this as unknown as R2Bucket;
	}
}
