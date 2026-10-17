import { groupRangeSchema, knownNewSchema, mealRuleSchema, slotSettingSchema } from '@app/domain/family';
import { FOOD_GROUPS } from '@app/domain/planner';
import { z } from 'zod';
import { familyRoleSchema, measurementSystemSchema } from '../profile/index.ts';

export const familyViewSchema = z.object({
	id: z.uuid(),
	name: z.string(),
	measurementSystem: measurementSystemSchema,
	timeZone: z.string(),
	myRole: familyRoleSchema,
	/** Administrators first, then by name. */
	members: z.array(
		z.object({
			userId: z.uuid(),
			displayName: z.string(),
			role: familyRoleSchema,
			isMe: z.boolean(),
			joinedAt: z.iso.datetime({ offset: true }),
			/** Account from an invitation whose email is not confirmed yet (spec W15, section 2). */
			emailUnconfirmed: z.boolean(),
		}),
	),
});
export type FamilyView = z.infer<typeof familyViewSchema>;

/** The planner settings as web and MCP see them: resolved, without the score weights. */
export const visibleSettingsSchema = z.object({
	slots: z.object({ lunch: z.array(slotSettingSchema).length(7), dinner: z.array(slotSettingSchema).length(7) }),
	rules: z.array(mealRuleSchema),
	knownNew: knownNewSchema,
	groupRanges: z.record(z.enum(FOOD_GROUPS), groupRangeSchema),
});

export const settingsViewSchema = z.object({
	settings: visibleSettingsSchema,
	/** Books not archived, plus owned ones even if archived; by title. */
	books: z.array(z.object({ id: z.uuid(), title: z.string(), owned: z.boolean() })),
	/** Ingredients the family avoids or limits, by name in the caller's language. */
	restrictions: z.array(
		z.object({
			ingredientId: z.uuid(),
			name: z.string(),
			restriction: z.enum(['avoid', 'limit']),
			weeklyMax: z.number().int().nullable(),
		}),
	),
	/** Family administrators change the settings; members read them. */
	canEdit: z.boolean(),
});
export type SettingsView = z.infer<typeof settingsViewSchema>;

export const ingredientMatchSchema = z.object({ id: z.uuid(), name: z.string() });

export const exclusionsViewSchema = z.array(
	z.object({
		recipe: z.object({ id: z.uuid(), name: z.string() }),
		reason: z.string().nullable(),
		/** null: the person who added it is no longer a member ("ex membro"). */
		createdByName: z.string().nullable(),
		createdAt: z.iso.datetime({ offset: true }),
	}),
);
export type ExclusionsView = z.infer<typeof exclusionsViewSchema>;
