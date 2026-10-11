import { oc } from '@orpc/contract';
import { commonErrors } from './errors.ts';

export type Role = 'user' | 'familyMember' | 'familyAdmin' | 'curator' | 'appAdmin';
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
}

const base = oc.$meta<Partial<OperationMeta>>({}).errors(commonErrors);

/** Starts an operation; the metadata argument makes the exposure choice explicit. */
export function op(meta: OperationMeta) {
	return base.meta(meta);
}
