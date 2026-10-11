import { z } from 'zod';
import {
	defaultPlannerSettings,
	FOOD_GROUPS,
	MEAL_TYPES,
	PROTEIN_GROUPS,
	type DishKind,
	type MealRule,
	type PlannerSettings,
	type ScoreWeights,
} from '../planner/index.ts';

/** Limits shared by stored values, contract inputs and the interface (round 4 of the prototype). */
export const MAX_SERVINGS = 12;
export const TIME_LIMITS = [15, 20, 30, 45, 60] as const;
export const FIXED_TEXT_MAX = 60;
export const KNOWN_NEW_MAX = 14;
export const GROUP_MAX = 14;
export const DISH_KINDS = ['pasta', 'rice', 'bread_wrap', 'skottle'] as const satisfies readonly DishKind[];

const weekday = z.number().int().min(0).max(6);

export const slotSettingSchema = z.object({
	servings: z.number().int().min(0).max(MAX_SERVINGS),
	fixedText: z.string().trim().min(1).max(FIXED_TEXT_MAX).nullable(),
	maxMinutes: z.literal(TIME_LIMITS).nullable(),
});

export const mealRuleSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('only_lunch'), dish: z.enum(DISH_KINDS) }),
	z.object({ kind: z.literal('at_least_one'), group: z.enum(PROTEIN_GROUPS), weekday }),
	z.object({ kind: z.literal('never_on'), group: z.enum(PROTEIN_GROUPS), weekday }),
	z.object({ kind: z.literal('never_fresh_fish'), weekday }),
]) satisfies z.ZodType<MealRule>;

const count = z.number().int().min(0).max(KNOWN_NEW_MAX);
export const knownNewSchema = z.object({ known: count, new: count, tolerance: count });

const groupBound = z.number().int().min(0).max(GROUP_MAX);
export const groupRangeSchema = z
	.object({ min: groupBound, max: groupBound })
	.refine((range) => range.min <= range.max, { message: 'min_above_max', path: ['min'] });

const dayKey = z.enum(['0', '1', '2', '3', '4', '5', '6']);

/**
 * What `families.settings` holds: only the values the family chose, the rest comes from the
 * planner defaults. Meals are stored one by one (`slots.lunch."4"`), so concurrent changes to
 * different days never overwrite each other.
 */
export const storedSettingsSchema = z.object({
	slots: z.partialRecord(z.enum(MEAL_TYPES), z.partialRecord(dayKey, slotSettingSchema)).optional(),
	rules: z.array(mealRuleSchema).optional(),
	knownNew: knownNewSchema.optional(),
	groupRanges: z.partialRecord(z.enum(FOOD_GROUPS), groupRangeSchema).optional(),
	/** Never written by web or MCP; read only by the planner. */
	weights: z.record(z.string(), z.number()).optional(),
});
export type StoredSettings = z.infer<typeof storedSettingsSchema>;

/** What web and MCP see: the score weights stay hidden (spec section 2). */
export type VisibleSettings = Omit<PlannerSettings, 'weights'>;

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/** Rules have no id: they are identified by their value, whatever the order of the fields. */
const ruleKey = (rule: MealRule) => JSON.stringify(Object.entries(rule).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

export function sameRule(a: MealRule, b: MealRule): boolean {
	return ruleKey(a) === ruleKey(b);
}

/** No duplicates, stable order: adding an existing rule or removing a missing one changes nothing. */
export function normalizeRules(rules: MealRule[]): MealRule[] {
	const byKey = new Map(rules.map((rule) => [ruleKey(rule), rule]));
	return [...byKey.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, rule]) => rule);
}

/**
 * The planner defaults with the family's valid choices on top. Invalid pieces (old or
 * hand-written data) are dropped one by one: reading the settings never fails.
 */
export function resolveFamilySettings(stored: unknown): PlannerSettings {
	const settings = defaultPlannerSettings();
	if (!isObject(stored)) return settings;
	if (isObject(stored.slots)) {
		for (const meal of MEAL_TYPES) {
			const days = stored.slots[meal];
			if (!isObject(days)) continue;
			for (const [day, value] of Object.entries(days)) {
				if (!dayKey.safeParse(day).success) continue;
				const slot = slotSettingSchema.safeParse(value);
				if (slot.success) settings.slots[meal][Number(day)] = slot.data;
			}
		}
	}
	if (Array.isArray(stored.rules)) {
		settings.rules = normalizeRules(
			stored.rules.flatMap((rule) => {
				const parsed = mealRuleSchema.safeParse(rule);
				return parsed.success ? [parsed.data] : [];
			}),
		);
	}
	const knownNew = knownNewSchema.safeParse(stored.knownNew);
	if (knownNew.success) settings.knownNew = knownNew.data;
	if (isObject(stored.groupRanges)) {
		for (const group of FOOD_GROUPS) {
			const range = groupRangeSchema.safeParse(stored.groupRanges[group]);
			if (range.success) settings.groupRanges[group] = range.data;
		}
	}
	if (isObject(stored.weights)) {
		for (const key of Object.keys(settings.weights) as (keyof ScoreWeights)[]) {
			const value = stored.weights[key];
			if (typeof value === 'number' && Number.isFinite(value)) settings.weights[key] = value;
		}
	}
	return settings;
}
