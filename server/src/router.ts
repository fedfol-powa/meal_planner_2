import { contract } from '@app/contract';
import { createImplementer } from './pipeline.ts';
import { ratingsRouter } from './recipes/router.ts';

const os = createImplementer(contract);

export const router = os.router({
	session: {
		whoami: os.session.whoami.handler(({ context }) => ({
			userId: context.userId,
			channel: context.channel,
			clientId: context.clientId,
			locale: context.locale,
		})),
	},
	ratings: ratingsRouter(os),
});
