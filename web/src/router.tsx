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
import { PasswordPage } from './routes/profile/PasswordPage';
import { SettingsPage } from './routes/profile/SettingsPage';
import { RecipePage } from './routes/RecipePage';
import { RecipesPage } from './routes/RecipesPage';
import { RouteError } from './routes/RouteError';
import { AgentsPage } from './features/agents/AgentsPage';
import { AuthorizePage } from './features/agents/AuthorizePage';
import { validateAuthorizeSearch } from './features/agents/search';
import { AdminPage } from './features/admin/AdminPage';
import { UserPage } from './features/admin/UserPage';
import { UserDeletePage } from './features/admin/UserDeletePage';
import { InvitePage } from './features/app-invitations/InvitePage';
import { InvitePage as FamilyInvitePage } from './features/family-invitations/InvitePage';
import { DraftPage } from './features/catalogue/DraftPage';
import { NewFamilyPage } from './features/family-new/NewFamilyPage';
import { FamilyDeletePage } from './features/family-delete/FamilyDeletePage';
import { AccountDeletePage } from './features/account/AccountDeletePage';
import { ShoppingPage } from './features/shopping/ShoppingPage';
import { ChoosePasswordPage } from './features/password/ChoosePasswordPage';
import { ForgotPage } from './features/password/ForgotPage';
import { validateEmailSearch, validateFamilyDeleteSearch, validateLoginSearch, validateMenuSearch, validateNewFamilySearch, validateRecipeSearch, validateRecipesSearch } from './routes/search';

/** `exit.pending`: a session just closed here; its redirect to sign-in drops the page, and the next person starts from the menu. */
export interface RouterContext { auth: AuthState; exit: { pending: boolean } }

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: () => <Outlet />,
  notFoundComponent: NotFound
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  validateSearch: validateLoginSearch,
  beforeLoad: ({ context, search, location }) => {
    if (context.auth.status !== 'signedIn') return;
    // A fragment of the sign-in page goes on to a redirect without one: an invitation token
    // travels this way, never in the query (spec W11).
    const target = search.redirect ?? '/menu';
    const hash = location.hash && !target.includes('#') ? `#${location.hash}` : '';
    throw redirect({ href: `${target}${hash}`, replace: true });
  },
  component: LoginPage
});

// Password links (spec W15): public, like the sign-in page; the code of /password in the fragment.
const forgotRoute = createRoute({ getParentRoute: () => rootRoute, path: '/password/forgot', validateSearch: validateEmailSearch, component: ForgotPage });
const choosePasswordRoute = createRoute({ getParentRoute: () => rootRoute, path: '/password', component: ChoosePasswordPage });

// Agent consent (spec section 13): no navbar; signing in first comes back here (after «Cambia account», to the page that asks to start again from the agent).
const authorizeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/authorize',
  validateSearch: validateAuthorizeSearch,
  beforeLoad: ({ context, location }) => {
    if (context.auth.status === 'signedOut') throw redirect({ to: '/login', search: { redirect: location.href }, replace: true });
  },
  component: AuthorizePage
});

// App invitation (spec W9): public, the token in the fragment; signs out another account on request.
const appInviteRoute = createRoute({ getParentRoute: () => rootRoute, path: '/invite/app', component: InvitePage });
// Family invitation (spec W11): public, the token in the fragment; joins with the account open or creates one.
const familyInviteRoute = createRoute({ getParentRoute: () => rootRoute, path: '/invite', component: FamilyInvitePage });

// Pathless layout: every view behind sign-in, with the navbar.
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_app',
  beforeLoad: ({ context, location }) => {
    if (context.auth.status !== 'signedIn') throw redirect({ to: '/login', search: context.exit.pending ? {} : { redirect: location.href }, replace: true });
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
const passwordRoute = createRoute({ getParentRoute: () => appRoute, path: '/profile/password', component: PasswordPage });
const preferencesRoute = createRoute({ getParentRoute: () => appRoute, path: '/profile/preferences', component: PreferencesPage });
const membersRoute = createRoute({ getParentRoute: () => appRoute, path: '/profile/family', component: MembersPage });
const settingsRoute = createRoute({ getParentRoute: () => appRoute, path: '/profile/family/settings', component: SettingsPage });
const exclusionsRoute = createRoute({ getParentRoute: () => appRoute, path: '/profile/family/exclusions', component: ExclusionsPage });
// Deletion of a family (spec W11): only navigation, nothing is deleted on opening; also the link agents get.
const familyDeleteRoute = createRoute({ getParentRoute: () => appRoute, path: '/profile/family/delete', validateSearch: validateFamilyDeleteSearch, component: FamilyDeletePage });
// Deletion of one's own account (spec W11): only navigation, nothing is deleted on opening; also the link agents get.
const accountDeleteRoute = createRoute({ getParentRoute: () => appRoute, path: '/profile/account/delete', component: AccountDeletePage });
// New family (spec W9): the minimal wizard, also «Crea un'altra famiglia» from the profile.
const newFamilyRoute = createRoute({ getParentRoute: () => appRoute, path: '/family/new', validateSearch: validateNewFamilySearch, component: NewFamilyPage });
// App administration (spec W9): app_admin only, also checked by the server.
const adminRoute = createRoute({ getParentRoute: () => appRoute, path: '/admin', component: AdminPage });
const userRoute = createRoute({ getParentRoute: () => appRoute, path: '/admin/users/$userId', component: UserPage });
// Deletion of another user (spec W11): only navigation, nothing is deleted on opening.
const userDeleteRoute = createRoute({ getParentRoute: () => appRoute, path: '/admin/users/$userId/delete', component: UserDeletePage });
const agentsRoute = createRoute({ getParentRoute: () => appRoute, path: '/profile/agents', component: AgentsPage });
// `day`: the menu day the list was opened from, where «Menu» goes back to.
const shoppingRoute = createRoute({ getParentRoute: () => appRoute, path: '/shopping/$weekStartsOn', validateSearch: validateMenuSearch, component: ShoppingPage });

const routeTree = rootRoute.addChildren([
  loginRoute,
  forgotRoute,
  choosePasswordRoute,
  authorizeRoute,
  appInviteRoute,
  familyInviteRoute,
  appRoute.addChildren([indexRoute, menuRoute, recipesRoute, draftRoute, recipeRoute, profileRoute, preferencesRoute, passwordRoute, membersRoute, settingsRoute, exclusionsRoute, familyDeleteRoute, accountDeleteRoute, agentsRoute, newFamilyRoute, adminRoute, userRoute, userDeleteRoute, shoppingRoute])
]);

export function createAppRouter(history?: RouterHistory) {
  return createRouter({ routeTree, history, context: { auth: { status: 'loading' }, exit: { pending: false } } });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
  interface HistoryState {
    /** The name of the user just deleted from the administration, told once by /admin (spec W11). */
    userDeleted?: string;
  }
}
