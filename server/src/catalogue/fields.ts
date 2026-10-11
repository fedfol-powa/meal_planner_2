const present = (value: unknown) => value !== undefined && value !== null;

/** Sorted keys of a JSON value, so equal documents compare equal whatever the key order. */
function canonical(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonical);
	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.keys(value)
				.sort()
				.map((k) => [k, canonical((value as Record<string, unknown>)[k])]),
		);
	}
	return value;
}

export const sameDocument = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

/** Top-level document fields that differ (the prototype's changedFields); absent and null are the same. */
export function changedFields(a: object, b: object): string[] {
	const left = a as Record<string, unknown>;
	const right = b as Record<string, unknown>;
	const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
	return keys.filter((k) => (present(left[k]) || present(right[k])) && !sameDocument(left[k] ?? null, right[k] ?? null));
}
