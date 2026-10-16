import { z } from 'zod';
import { errorDefinitions } from '../errors.ts';
import { op } from '../op.ts';

/** What happens to one family of the person (spec W11, section 2). */
export const deletionFamilySchema = z.object({
	familyId: z.uuid(),
	name: z.string(),
	outcome: z.enum(['stays', 'needs_successor', 'deleted']),
	/** The other members, when a successor is needed. */
	candidates: z.array(z.object({ userId: z.uuid(), displayName: z.string() })),
});
export type DeletionFamily = z.infer<typeof deletionFamilySchema>;

export const deletionPlanSchema = z.object({
	families: z.array(deletionFamilySchema),
	lastAppAdmin: z.boolean(),
	/** Open family links and pending app invitations created by the person. */
	openInvitations: z.number().int().min(0),
	/** The deletion started and waits for Auth. */
	pending: z.boolean(),
});
export type DeletionPlan = z.infer<typeof deletionPlanSchema>;

export const deletionInputSchema = z.object({
	/** familyId → userId of the new administrator, for each family that needs one. */
	successors: z.record(z.uuid(), z.uuid()),
	/** The families the page showed as deleted: a different set answers conflict. */
	deletedFamilies: z.array(z.uuid()),
});
export type DeletionInput = z.infer<typeof deletionInputSchema>;

export const accountContract = {
	getDeletionPlan: op({ mcp: { readOnly: true }, offline: false, role: 'user' })
		.route({
			method: 'GET',
			path: '/account/deletion',
			summary:
				'What deleting your account does: each family stays, needs a successor or is deleted, whether you are the last app administrator, your open invitations and connected agents',
		})
		.input(z.object({}))
		.output(deletionPlanSchema.extend({ connectedAgents: z.number().int().min(0) })),
	delete: op({ mcp: { readOnly: false }, offline: false, role: 'user' })
		.route({
			method: 'POST',
			path: '/account/deletion',
			summary:
				'Delete your account for good: name, email, ratings and accesses, agents included. Ask the person to confirm explicitly first. Name a successor for each family where you are the only administrator. When a family would be deleted, agents get the link to the page of the app instead. Published recipes stay',
		})
		.errors({ last_app_admin: errorDefinitions.last_app_admin })
		.input(deletionInputSchema)
		/** `completed: false`: the account is already unusable; removing it from Auth is retried hourly. */
		.output(z.object({ completed: z.boolean() })),
};
