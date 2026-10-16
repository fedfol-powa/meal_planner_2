import type { Contract, Locale, OperationMeta } from '@app/contract';
import type { AnyContractRouter } from '@orpc/contract';
import { implement, type RouterImplementer } from '@orpc/server';
import { channelOf, KeySourceError, type Channel, type Claims } from './auth.ts';
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
	/** CF-Connecting-IP, the key of the public limiters. */
	clientIp: string;
	/** Current time; tests replace it. The pipeline reads it once per request into `now`. */
	clock?: () => Date;
	/** The upload body was over the limit: `rejectOversizedUpload` refuses the request (W12). */
	uploadTooLarge?: true;
}

export interface OperationContext extends RequestContext {
	/** The fixed instant of the request: one reading of the clock. */
	now: Date;
	userId: string;
	channel: Channel;
	clientId: string | null;
	locale: Locale;
	tx: Tx;
	/** Set for versioned reads: handlers return `fresh(context, view)`. */
	version?: string;
}

/** Context of a `public` operation: no user, no transaction held by the pipeline (spec W9). */
export interface PublicOperationContext extends RequestContext {
	public: true;
	now: Date;
	/** One short `anon` transaction, opened and closed here: nothing stays busy while the handler waits on Auth. */
	anonDb<T>(work: (tx: Tx) => Promise<T>): Promise<T>;
}

/** The context of a public handler; throws when used by a signed-in operation. */
export function publicContext(context: unknown): PublicOperationContext {
	if ((context as { public?: unknown }).public !== true) throw new Error('publicContext() used outside a public operation');
	return context as PublicOperationContext;
}

const LIMITERS = { read: 'INVITE_READ_LIMIT', accept: 'INVITE_ACCEPT_LIMIT' } as const;

export function webOnlyUrl(origin: string, path: string, input: unknown): string {
	const values = (input ?? {}) as Record<string, unknown>;
	const filled = path.replace(/:([A-Za-z]+)/g, (_, name: string) => encodeURIComponent(String(values[name] ?? '')));
	return new URL(filled, origin).toString();
}

class Continuation<T> {
	readonly next: () => Promise<T>;
	constructor(next: () => Promise<T>) {
		this.next = next;
	}
}

/** What a handler returns in place of its output: typed as the output, replaced by the pipeline. */
export type AfterCommit<T> = T;

/**
 * Work after the commit (spec W11, section 2): the pipeline commits the transaction, then runs
 * `next` with no connection open and uses its result as the output. An error of `next` follows
 * the usual error handling, with the transaction already committed.
 */
export function afterCommit<T>(next: () => Promise<T>): AfterCommit<T> {
	return new Continuation(next) as unknown as AfterCommit<T>;
}

export function fresh<T>(context: OperationContext, data: T): { unchanged: false; version: string; data: T } {
	if (!context.version) throw new Error('fresh() used outside a versioned read');
	return { unchanged: false, version: context.version, data };
}

async function authenticate(context: RequestContext): Promise<Claims> {
	if (!context.token) throw appError('unauthorized');
	try {
		return await context.verify(context.token);
	} catch (error) {
		// Unreadable signing keys are an outage, not a bad token: they become `internal`.
		if (error instanceof KeySourceError) throw error;
		throw appError('unauthorized');
	}
}

export interface PrepareResult {
	/** Appended to the version of the read (for example the effective date). */
	versionPart?: string;
}

/** Runs inside the user's transaction before the version is read: validation against the server's state, lazy work. */
export type Prepare = (context: OperationContext, input: unknown) => Promise<PrepareResult | void>;

/**
 * Operations whose transaction is repeated once when Postgres breaks a lock cycle with 40P01
 * (spec W11, decision 19): deletions that lock a family and then cascade over rows an ordinary
 * change may hold. The first attempt is rolled back whole; the second redoes session, role and
 * handler; only the committed attempt's result and continuation are used. A server rule, not
 * contract metadata.
 */
export const RETRY_ON_DEADLOCK: readonly string[] = ['family.delete', 'account.delete', 'users.delete'];

export interface ImplementerOptions {
	/** By operation path joined with dots, for example `menu.getOpening`. */
	prepare?: Record<string, Prepare>;
	/** Replaces RETRY_ON_DEADLOCK (tests). */
	retryOnDeadlock?: readonly string[];
}

const isDeadlock = (error: unknown) => (error as { code?: unknown } | null)?.code === '40P01';

/**
 * Implementer shared by every operation. Input is validated first and output last
 * (validation indexes around all middleware); in between: token and claims, transaction
 * as the user, profile and session, web-only check, role, prepare, version; the handler runs
 * inside the transaction. Public operations: limiter, then the handler opens its own short
 * anon transactions (no token read, no transaction of the pipeline).
 */
export function createImplementer<C extends AnyContractRouter>(contract: C, options: ImplementerOptions = {}) {
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
	return base.use<OperationContext>(async ({ context, procedure, path, next }, input) => {
		const meta = procedure['~orpc'].meta as OperationMeta;
		if (meta.role === 'public') {
			// Before any database access; the token, if any, is never read (spec W9).
			const limiter = context.env[LIMITERS[meta.rateLimit!]];
			if (!(await limiter.limit({ key: context.clientIp })).success) throw appError('rate_limited');
			const operation: PublicOperationContext = {
				...context,
				public: true,
				now: context.clock?.() ?? new Date(),
				anonDb: (work) => withDb(context.env.HYPERDRIVE.connectionString, { kind: 'anon' }, work),
			};
			return next({ context: operation as unknown as OperationContext });
		}
		const claims = await authenticate(context);
		const channel = channelOf(claims);
		const attempt = () => withDb(context.env.HYPERDRIVE.connectionString, { kind: 'user', claims }, async (tx) => {
			const locale = await loadSession(tx);
			context.state.locale = locale;
			if (meta.webOnly && channel === 'mcp') {
				throw appError('web_only', { url: webOnlyUrl(context.origin, meta.webOnly.path, input) });
			}
			await checkRole(tx, meta.role, input);
			const operation: OperationContext = {
				...context,
				now: context.clock?.() ?? new Date(),
				userId: claims.sub,
				channel,
				clientId: claims.client_id ?? null,
				locale,
				tx,
			};
			const extra = await options.prepare?.[path.join('.')]?.(operation, input);
			if (meta.reads) {
				operation.version = await readVersion(tx, meta.reads, input, locale, context.deployId);
				if (extra?.versionPart) operation.version += `.${extra.versionPart}`;
				if ((input as { knownVersion?: string }).knownVersion === operation.version) {
					// oRPC reads only `output` when a middleware answers without `next`.
					return { output: { unchanged: true, version: operation.version }, context: operation };
				}
			}
			return next({ context: operation });
		});
		const retry = (options.retryOnDeadlock ?? RETRY_ON_DEADLOCK).includes(path.join('.'));
		const result = await attempt().catch((error: unknown) => {
			if (retry && isDeadlock(error)) return attempt();
			throw error;
		});
		// After the commit, outside the repetition: a 40P01 of the continuation repeats nothing.
		if (result.output instanceof Continuation) return { ...result, output: await result.output.next() };
		return result;
	});
}

/** The implementer built once in router.ts and handed to the area factories. */
export type Implementer = ReturnType<typeof createImplementer<Contract>>;
