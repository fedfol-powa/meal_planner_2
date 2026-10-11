import { contract } from '@app/contract';
import { menuPrepare, menuRouter } from './menu/router.ts';
import { createImplementer } from './pipeline.ts';
import { familyRouter } from './family/router.ts';
import { profileRouter } from './profile/router.ts';
import { ratingsRouter } from './recipes/router.ts';

const os = createImplementer(contract, { prepare: { ...menuPrepare } });

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
	profile: profileRouter(os),
	family: familyRouter(os),
	menu: menuRouter(os),
});
