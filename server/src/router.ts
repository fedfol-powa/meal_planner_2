import { contract } from '@app/contract';
import { agentsRouter } from './agents/router.ts';
import { appInvitationsRouter } from './app-invitations/router.ts';
import { catalogueRouter } from './catalogue/router.ts';
import { mealsRouter } from './meals/router.ts';
import { menuPrepare, menuRouter } from './menu/router.ts';
import { createImplementer } from './pipeline.ts';
import { familyRouter } from './family/router.ts';
import { profileRouter } from './profile/router.ts';
import { ratingsRouter, recipesRouter } from './recipes/router.ts';
import { mealRecipeVersionsAt } from './menu/versions.ts';
import { createShoppingRouter } from './shopping/router.ts';
import { shoppingPrepare } from './shopping/version.ts';
import { usersRouter } from './users/router.ts';

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
	meals: mealsRouter(os),
	catalogue: catalogueRouter(os),
	agents: agentsRouter(os),
	appInvitations: appInvitationsRouter(os),
	users: usersRouter(os),
	shopping: createShoppingRouter(os, { mealRecipeVersions: mealRecipeVersionsAt }),
});
