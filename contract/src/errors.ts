import { z } from 'zod';

/** Error codes of the operations (specification, section 1). Clients translate them. */
export const errorCodes = [
	'unauthorized',
	'forbidden',
	'not_found',
	'invalid',
	'conflict',
	'not_allowed',
	'last_admin',
	'last_app_admin',
	'sole_member',
	'web_only',
	'internal',
] as const;
export type ErrorCode = (typeof errorCodes)[number];

export function isErrorCode(code: string): code is ErrorCode {
	return (errorCodes as readonly string[]).includes(code);
}

export const invalidData = z.object({
	issues: z.array(z.object({ path: z.array(z.union([z.string(), z.number()])), code: z.string() })),
});
const conflictAuthor = { by: z.uuid().nullable(), byName: z.string().nullable(), at: z.iso.datetime() };
/** Catalogue conflicts (spec section 8): a draft saved by someone else, a newer version, a changed ingredient. */
export const conflictData = z.discriminatedUnion('kind', [
	z.object({
		kind: z.literal('draft'),
		revision: z.number().int().min(1),
		...conflictAuthor,
		theirFields: z.array(z.string()),
		myFields: z.array(z.string()),
		/** The draft document as the other curator saved it. */
		theirs: z.record(z.string(), z.unknown()),
	}),
	z.object({ kind: z.literal('version'), version: z.number().int().min(1), ...conflictAuthor }),
	z.object({ kind: z.literal('ingredient'), version: z.number().int().min(1), ...conflictAuthor, fields: z.array(z.string()) }),
]);
export type ConflictData = z.infer<typeof conflictData>;
/** A rule of state, not wrong data: a cited draft, a never-published recipe, the current version. */
/** A rule of state, not wrong data: catalogue states and meal undos that are no longer possible. */
export const notAllowedData = z.object({
	reason: z.enum(['cited_by_meals', 'not_published', 'already_current', 'not_own_change', 'changed_since', 'draft_closed']),
});
export type NotAllowedReason = z.infer<typeof notAllowedData>['reason'];
export const webOnlyData = z.object({ url: z.url() });
/** Correlates the answer with the Worker log line of the unexpected error. */
export const internalData = z.object({ requestId: z.string() });

export const errorDefinitions = {
	unauthorized: { status: 401 },
	forbidden: { status: 403 },
	not_found: { status: 404 },
	invalid: { status: 400, data: invalidData },
	conflict: { status: 409, data: conflictData },
	not_allowed: { status: 409, data: notAllowedData },
	last_admin: { status: 409 },
	last_app_admin: { status: 409 },
	sole_member: { status: 409 },
	web_only: { status: 403, data: webOnlyData },
	internal: { status: 500, data: internalData },
} as const satisfies Record<ErrorCode, { status: number; data?: z.ZodType }>;

/** Errors every operation can raise; operations add their own with `.errors()`. */
export const commonErrors = {
	unauthorized: errorDefinitions.unauthorized,
	forbidden: errorDefinitions.forbidden,
	invalid: errorDefinitions.invalid,
	web_only: errorDefinitions.web_only,
	internal: errorDefinitions.internal,
};
