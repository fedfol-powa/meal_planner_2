import type { ProfileView } from '@app/contract';

/** The web check of /admin (spec W9, interface for B); the server checks the role again. */
export const hasAppAdmin = (profile: ProfileView | undefined) => profile?.user.globalRoles.includes('app_admin') ?? false;
