import { z } from 'zod';
import { localeSchema } from '../locale.ts';
import { op } from '../op.ts';

export const familyRoleSchema = z.enum(['family_admin', 'member']);
export const measurementSystemSchema = z.enum(['metric', 'uk_imperial']);
export const displayNameSchema = z.string().trim().min(1).max(60);

export const profileViewSchema = z.object({
	user: z.object({
		id: z.uuid(),
		displayName: z.string(),
		email: z.string(),
		locale: localeSchema,
		/** Whether the person gets the weekly "menu is ready" email. */
		menuEmails: z.boolean(),
		globalRoles: z.array(z.enum(['recipe_curator', 'app_admin'])),
	}),
	/** By name in the caller's language. */
	families: z.array(
		z.object({
			id: z.uuid(),
			name: z.string(),
			role: familyRoleSchema,
			timeZone: z.string(),
			measurementSystem: measurementSystemSchema,
		}),
	),
	/** The family shown in the app: the saved choice, otherwise the first one; null without families. */
	currentFamilyId: z.uuid().nullable(),
});
export type ProfileView = z.infer<typeof profileViewSchema>;

export const profileContract = {
	get: op({ mcp: { readOnly: true }, offline: false, role: 'user' })
		.route({ method: 'GET', path: '/profile', summary: 'Your name, language, global roles, families and the family shown in the app' })
		.input(z.object({}))
		.output(profileViewSchema),
	update: op({ mcp: { readOnly: false }, offline: false, role: 'user' })
		.route({ method: 'PATCH', path: '/profile', summary: 'Change your display name, your language (it-IT or en-GB) or whether you get the weekly menu email' })
		.input(
			z
				.object({ displayName: displayNameSchema.optional(), locale: localeSchema.optional(), menuEmails: z.boolean().optional() })
				.refine((value) => value.displayName !== undefined || value.locale !== undefined || value.menuEmails !== undefined, {
					message: 'empty',
					path: ['displayName'],
				}),
		)
		.output(profileViewSchema),
	setCurrentFamily: op({ mcp: { readOnly: false }, offline: false, role: 'user' })
		.route({
			method: 'PUT',
			path: '/profile/current-family',
			summary: 'Choose the family shown in the app; agents still pass familyId to every family tool',
		})
		.input(z.object({ familyId: z.uuid() }))
		.output(profileViewSchema),
};
