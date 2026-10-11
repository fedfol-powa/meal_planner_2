import { contract } from '@app/contract';
import { catalogueRouter } from './catalogue/router.ts';
import { menuPrepare, menuRouter } from './menu/router.ts';
import { createImplementer } from './pipeline.ts';
import { familyRouter } from './family/router.ts';
import { profileRouter } from './profile/router.ts';
import { ratingsRouter, recipesRouter } from './recipes/router.ts';
import { mealRecipeVersionsAt } from './menu/versions.ts';
import { createShoppingRouter } from './shopping/router.ts';
import { shoppingPrepare } from './shopping/version.ts';

const os = createImplementer(contract, { prepare: { ...menuPrepare, ...shoppingPrepare } });

export const router = os.router({
	session: {
		whoami: os.session.whoami.handler(({ context }) => ({
			userId: context.userId,
			channel: context.channel,
			clientId: context.clientId,
			locale: context.locale,
		})),
	},
	recipes: recipesRouter(os),
	ratings: ratingsRouter(os),
	profile: profileRouter(os),
	family: familyRouter(os),
	menu: menuRouter(os),
	catalogue: catalogueRouter(os),
	shopping: createShoppingRouter(os, { mealRecipeVersions: mealRecipeVersionsAt }),
});
