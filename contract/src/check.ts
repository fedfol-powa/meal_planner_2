import { z } from 'zod';
import type { OperationMeta } from './op.ts';
import { isVersionedOutput } from './versioned.ts';

interface ProcedureDef {
	meta: Partial<OperationMeta>;
	route: { method?: string; path?: string; summary?: string };
	inputSchema?: unknown;
	outputSchema?: unknown;
}

function walk(node: object, path: string[], visit: (def: ProcedureDef, name: string) => void): void {
	if ('~orpc' in node) {
		visit((node as { '~orpc': ProcedureDef })['~orpc'], path.join('.'));
		return;
	}
	for (const [key, child] of Object.entries(node)) {
		if (typeof child === 'object' && child !== null) walk(child, [...path, key], visit);
	}
}

const accepts = (schema: z.ZodType, value: unknown) => schema.safeParse(value).success;

/** A required, non-nullable uuid: identifiers that idempotence and permissions rely on. */
function requiresUuid(schema: unknown): boolean {
	if (!(schema instanceof z.ZodType)) return false;
	return (
		accepts(schema, crypto.randomUUID()) &&
		!accepts(schema, 'not-a-uuid') &&
		!accepts(schema, undefined) &&
		!accepts(schema, null)
	);
}

/** An optional string: absent or a version string, never a number or null. */
function isOptionalString(schema: unknown): boolean {
	if (!(schema instanceof z.ZodType)) return false;
	return accepts(schema, undefined) && accepts(schema, 'v1') && !accepts(schema, 1) && !accepts(schema, null);
}

/** Convention problems of every operation in a contract router; empty when all is well. */
export function checkContract(router: object): string[] {
	const problems: string[] = [];
	walk(router, [], (def, name) => {
		const meta = def.meta;
		if (meta.mcp === undefined) problems.push(`${name}: missing mcp`);
		if (typeof meta.offline !== 'boolean') problems.push(`${name}: missing offline`);
		if (meta.role === undefined) problems.push(`${name}: missing role`);
		if (meta.webOnly && meta.mcp === false) problems.push(`${name}: webOnly needs mcp exposure to answer web_only`);
		if (!def.route.method || !def.route.path || !def.route.summary) {
			problems.push(`${name}: route needs method, path and summary`);
		}
		const shape = def.inputSchema instanceof z.ZodObject ? def.inputSchema.shape : undefined;
		if (!shape) {
			problems.push(`${name}: input must be a zod object`);
			return;
		}
		if ((meta.role === 'familyMember' || meta.role === 'familyAdmin') && !requiresUuid(shape.familyId)) {
			problems.push(`${name}: family role needs a uuid familyId input`);
		}
		if ((meta.offline || meta.creates) && !requiresUuid(shape.id)) {
			problems.push(`${name}: offline or creating operation needs a uuid id input`);
		}
		if (meta.reads) {
			if (!isOptionalString(shape.knownVersion)) {
				problems.push(`${name}: versioned read needs an optional string knownVersion input`);
			}
			if (!isVersionedOutput(def.outputSchema)) problems.push(`${name}: versioned read needs versionedOutput`);
			// The family counter is read from `input.familyId`.
			if (meta.reads.includes('family') && !requiresUuid(shape.familyId)) {
				problems.push(`${name}: family version needs a uuid familyId input`);
			}
		}
	});
	return problems;
}
