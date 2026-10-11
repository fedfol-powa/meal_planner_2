import { z } from 'zod';

/** Error codes of the operations (specification, section 1). Clients translate them. */
export const errorCodes = [
	'unauthorized',
	'forbidden',
	'not_found',
	'invalid',
	'conflict',
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
/** Final shape fixed with the drafts in wave 2. */
export const conflictData = z.object({ by: z.uuid(), at: z.iso.datetime(), fields: z.array(z.string()) });
export const webOnlyData = z.object({ url: z.url() });
/** Correlates the answer with the Worker log line of the unexpected error. */
export const internalData = z.object({ requestId: z.string() });

export const errorDefinitions = {
	unauthorized: { status: 401 },
	forbidden: { status: 403 },
	not_found: { status: 404 },
	invalid: { status: 400, data: invalidData },
	conflict: { status: 409, data: conflictData },
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
