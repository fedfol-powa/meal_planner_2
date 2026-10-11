import { z } from 'zod';
import { localeSchema } from './locale.ts';
import { op } from './op.ts';
import { profileContract } from './profile/index.ts';
import { ratingsContract } from './recipes/ratings.ts';

export const contract = {
	session: {
		whoami: op({ mcp: { readOnly: true }, offline: false, role: 'user' })
			.route({ method: 'GET', path: '/session/whoami', summary: 'Identify the caller, the channel and the language' })
			.input(z.object({}))
			.output(
				z.object({
					userId: z.uuid(),
					channel: z.enum(['web', 'mcp']),
					clientId: z.string().nullable(),
					locale: localeSchema,
				}),
			),
	},
	ratings: ratingsContract,
	profile: profileContract,
};

export type Contract = typeof contract;
