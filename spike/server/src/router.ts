import { implement } from '@orpc/server';
import { channelOf, type Claims, type Env } from './auth.ts';
import { contract } from './contract.ts';
import { withUserDb } from './db.ts';

export interface Context {
	env: Env;
	claims: Claims;
}

const os = implement(contract).$context<Context>();

export const router = os.router({
	recipes: {
		list: os.recipes.list.handler(({ input, context }) =>
			withUserDb(context.env, context.claims, async (tx) => {
				const rows = await tx<{ id: string; title: string }[]>`
					select id, title from spike.recipes order by title limit ${input.limit}`;
				return rows.map(({ id, title }) => ({ id, title }));
			}),
		),
	},
	session: {
		whoami: os.session.whoami.handler(({ context: { claims } }) => ({
			userId: claims.sub,
			channel: channelOf(claims),
			clientId: claims.client_id ?? null,
		})),
	},
});
