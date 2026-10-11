import type { Locale, OperationMeta } from '@app/contract';
import type { AnyContractRouter } from '@orpc/contract';
import { implement, type RouterImplementer } from '@orpc/server';
import { channelOf, type Channel, type Claims } from './auth.ts';
import { withDb, type Tx } from './db.ts';
import type { Env } from './env.ts';
import { appError } from './errors.ts';
import { checkRole } from './permissions.ts';
import { loadSession } from './session.ts';
import { readVersion } from './versions.ts';

/** Filled while the request runs, read by MCP to localise errors. */
export interface RequestState {
	locale?: Locale;
}

export interface RequestContext {
	env: Env;
	/** Correlates log lines and `internal` errors of this request. */
	requestId: string;
	/** Origin of the request, for absolute `web_only` URLs. */
	origin: string;
	token: string | undefined;
	verify(token: string): Promise<Claims>;
	deployId: string;
	state: RequestState;
}

export interface OperationContext extends RequestContext {
	userId: string;
	channel: Channel;
	clientId: string | null;
	locale: Locale;
	tx: Tx;
	/** Set for versioned reads: handlers return `fresh(context, view)`. */
	version?: string;
}

export function webOnlyUrl(origin: string, path: string, input: unknown): string {
	const values = (input ?? {}) as Record<string, unknown>;
	const filled = path.replace(/:([A-Za-z]+)/g, (_, name: string) => encodeURIComponent(String(values[name] ?? '')));
	return new URL(filled, origin).toString();
}

export function fresh<T>(context: OperationContext, data: T): { unchanged: false; version: string; data: T } {
	if (!context.version) throw new Error('fresh() used outside a versioned read');
	return { unchanged: false, version: context.version, data };
}

async function authenticate(context: RequestContext): Promise<Claims> {
	if (!context.token) throw appError('unauthorized');
	try {
		return await context.verify(context.token);
	} catch {
		throw appError('unauthorized');
	}
}

/**
 * Implementer shared by every operation. Input is validated first and output last
 * (validation indexes around all middleware); in between: token and claims, transaction
 * as the user, profile and session, web-only check, role, version; the handler runs
 * inside the transaction.
 */
export function createImplementer<C extends AnyContractRouter>(contract: C) {
	// With a generic contract the implementer is a deferred conditional type: name the
	// router branch so `.use` resolves; callers still get the concrete implementer.
	const base = implement(contract)
		// Index 0: input is validated before the middleware, output after it returns, so the
		// `unchanged` answer given without the handler is validated like any other.
		.$config({
			initialInputValidationIndex: Number.NEGATIVE_INFINITY,
			initialOutputValidationIndex: Number.NEGATIVE_INFINITY,
		})
		.$context<RequestContext>() as unknown as RouterImplementer<C, RequestContext, RequestContext>;
	return base.use<OperationContext>(async ({ context, procedure, next }, input) => {
		const meta = procedure['~orpc'].meta as OperationMeta;
		const claims = await authenticate(context);
		const channel = channelOf(claims);
		return withDb(context.env.HYPERDRIVE.connectionString, { kind: 'user', claims }, async (tx) => {
			const locale = await loadSession(tx);
			context.state.locale = locale;
			if (meta.webOnly && channel === 'mcp') {
				throw appError('web_only', { url: webOnlyUrl(context.origin, meta.webOnly.path, input) });
			}
			await checkRole(tx, meta.role, input);
			const operation: OperationContext = {
				...context,
				userId: claims.sub,
				channel,
				clientId: claims.client_id ?? null,
				locale,
				tx,
			};
			if (meta.reads) {
				operation.version = await readVersion(tx, meta.reads, input, locale, context.deployId);
				if ((input as { knownVersion?: string }).knownVersion === operation.version) {
					// oRPC reads only `output` when a middleware answers without `next`.
					return { output: { unchanged: true, version: operation.version }, context: operation };
				}
			}
			return next({ context: operation });
		});
	});
}
