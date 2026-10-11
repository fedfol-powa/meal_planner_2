/** The R2 calls of the export, in memory. Pages of two objects exercise the list cursor. */
export class MemoryBucket {
	objects = new Map<string, { body: Uint8Array; customMetadata: Record<string, string> }>();
	failPut = false;
	failDelete = false;
	pageSize = 2;

	async put(key: string, value: Blob, options?: { customMetadata?: Record<string, string> }) {
		if (this.failPut) throw new Error('put failed');
		this.objects.set(key, { body: new Uint8Array(await value.arrayBuffer()), customMetadata: options?.customMetadata ?? {} });
		return { key };
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
