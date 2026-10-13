import { oc } from '@orpc/contract';
import { commonErrors } from './errors.ts';

export type Role = 'user' | 'familyMember' | 'familyAdmin' | 'curator' | 'appAdmin' | 'public';
/** Limiters of the public operations: bindings `INVITE_READ_LIMIT` and `INVITE_ACCEPT_LIMIT` of the Worker. */
export type RateLimitName = 'read' | 'accept';
export type VersionScope = 'family' | 'catalogue';

/** Required on every operation: the contract test rejects operations without it. */
export interface OperationMeta {
	/** Exposure as an MCP tool, generated from the contract. */
	mcp: { readOnly: boolean } | false;
	/** Reserved to the web app: MCP callers get `web_only` with this page (`:name` from the input). */
	webOnly?: { path: string };
	/** Can be queued offline: absolute state and a client-generated `id`. */
	offline: boolean;
	role: Role;
	/** Versioned read and the counters it depends on. */
	reads?: VersionScope[];
	/** Creates an entity whose `id` comes from the client. */
	creates?: true;
	/** Public operations only: the per-IP limiter checked before any database access. */
	rateLimit?: RateLimitName;
}

const base = oc.$meta<Partial<OperationMeta>>({}).errors(commonErrors);

/**
 * Starts an operation; the metadata argument makes the exposure choice explicit. A `public` one is
 * declared without authentication in the OpenAPI document (the global requirement is the bearer
 * token); later `.route()` calls keep this, as routes merge shallowly.
 */
export function op(meta: OperationMeta) {
	const operation = base.meta(meta);
	return meta.role === 'public' ? operation.route({ spec: (current) => ({ ...current, security: [] }) }) : operation;
}
