import { z } from 'zod';

const versionedOutputs = new WeakSet<z.ZodType>();

/**
 * Input of a versioned read: the version already held by the client, if any. Generic on the
 * object's shape, not on `z.ZodObject`: extending the default ZodObject would type the
 * fields as an index signature and handlers would lose the type of their input.
 */
export function versionedInput<Shape extends z.ZodRawShape>(schema: z.ZodObject<Shape>) {
	return schema.extend({ knownVersion: z.string().min(1).max(200).optional() });
}

/** Output of a versioned read: `unchanged` without data, or the fresh view. */
export function versionedOutput<T extends z.ZodType>(view: T) {
	const schema = z.discriminatedUnion('unchanged', [
		z.object({ unchanged: z.literal(true), version: z.string() }),
		z.object({ unchanged: z.literal(false), version: z.string(), data: view }),
	]);
	versionedOutputs.add(schema);
	return schema;
}

export function isVersionedOutput(schema: unknown): boolean {
	return typeof schema === 'object' && schema !== null && versionedOutputs.has(schema as z.ZodType);
}
