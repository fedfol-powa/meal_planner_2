import { z } from 'zod';
import { localeSchema } from './locale.ts';
import { op } from './op.ts';
import { familyContract } from './family/index.ts';
import { profileContract } from './profile/index.ts';
import { menuContract } from './menu/operations.ts';
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
	family: familyContract,
	menu: menuContract,
};

export type Contract = typeof contract;
