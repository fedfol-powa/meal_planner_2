import { createRootRouteWithContext, createRoute, createRouter, Outlet, redirect, type RouterHistory } from '@tanstack/react-router';
import type { AuthState } from './auth/AuthProvider';
import { LoginPage } from './auth/LoginPage';
import { AppLayout } from './routes/AppLayout';
import { MenuPage } from './routes/MenuPage';
import { NotFound } from './routes/NotFound';
import { ProfilePage } from './routes/ProfilePage';
import { MembersPage } from './routes/profile/MembersPage';
import { ExclusionsPage } from './routes/profile/ExclusionsPage';
import { PreferencesPage } from './routes/profile/PreferencesPage';
import { SettingsPage } from './routes/profile/SettingsPage';
import { RecipePage } from './routes/RecipePage';
import { RecipesPage } from './routes/RecipesPage';
import { RouteError } from './routes/RouteError';
import { DraftPage } from './features/catalogue/DraftPage';
import { ShoppingPage } from './features/shopping/ShoppingPage';
import { validateLoginSearch, validateMenuSearch, validateRecipeSearch, validateRecipesSearch } from './routes/search';

export interface RouterContext { auth: AuthState }

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: () => <Outlet />,
  notFoundComponent: NotFound
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  validateSearch: validateLoginSearch,
  beforeLoad: ({ context, search }) => {
    if (context.auth.status === 'signedIn') throw redirect({ href: search.redirect ?? '/menu', replace: true });
  },
  component: LoginPage
});

// Pathless layout: every view behind sign-in, with the navbar.
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_app',
  beforeLoad: ({ context, location }) => {
    if (context.auth.status !== 'signedIn') throw redirect({ to: '/login', search: { redirect: location.href }, replace: true });
  },
  component: AppLayout,
  errorComponent: RouteError
});

const indexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/menu', replace: true });
  }
});
const menuRoute = createRoute({ getParentRoute: () => appRoute, path: '/menu', validateSearch: validateMenuSearch, component: MenuPage });
const recipesRoute = createRoute({ getParentRoute: () => appRoute, path: '/recipes', validateSearch: validateRecipesSearch, component: RecipesPage });
// Before the parameter: «drafts» is never a recipe id (curators only, spec of W3, section 5).
const draftRoute = createRoute({ getParentRoute: () => appRoute, path: '/recipes/drafts/$draftId', component: DraftPage });
const recipeRoute = createRoute({ getParentRoute: () => appRoute, path: '/recipes/$recipeId', validateSearch: validateRecipeSearch, component: RecipePage });
const profileRoute = createRoute({ getParentRoute: () => appRoute, path: '/profile', component: ProfilePage });
const preferencesRoute = createRoute({ getParentRoute: () => appRoute, path: '/profile/preferences', component: PreferencesPage });
const membersRoute = createRoute({ getParentRoute: () => appRoute, path: '/profile/family', component: MembersPage });
const settingsRoute = createRoute({ getParentRoute: () => appRoute, path: '/profile/family/settings', component: SettingsPage });
const exclusionsRoute = createRoute({ getParentRoute: () => appRoute, path: '/profile/family/exclusions', component: ExclusionsPage });
// `day`: the menu day the list was opened from, where «Menu» goes back to.
const shoppingRoute = createRoute({ getParentRoute: () => appRoute, path: '/shopping/$weekStartsOn', validateSearch: validateMenuSearch, component: ShoppingPage });

const routeTree = rootRoute.addChildren([
  loginRoute,
  appRoute.addChildren([indexRoute, menuRoute, recipesRoute, draftRoute, recipeRoute, profileRoute, preferencesRoute, membersRoute, settingsRoute, exclusionsRoute, shoppingRoute])
]);

export function createAppRouter(history?: RouterHistory) {
  return createRouter({ routeTree, history, context: { auth: { status: 'loading' } } });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
