import { addDays, isMealPast, mondayOf, weekDates } from '#lib/domain/calendar.ts';
import { defaultSettings, slotSetting, weekdayOf } from '#lib/domain/settings.ts';
import type { DemoDatabase, Family, IsoDate, Locale, MealSlot, MealType, MeasurementSystem } from '#lib/domain/types.ts';
import { fail, ok, type OperationContext, type OpResult } from './context';
import { familyFor } from './access';
import { fitsSettings } from './constraints';
import { FAMILY_NAME_MAX, roleOf } from './family';
import { rankCandidates } from './suggestions';

export const DISPLAY_NAME_MAX = 40;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isEmail = (value: string) => EMAIL.test(value.trim());
export const findUserByEmail = (db: DemoDatabase, email: string) => db.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase()) ?? null;

/** Simulated sign-up (spec section 7, open registration): email and display name are the only personal data. */
export function createUser(db: DemoDatabase, email: string, displayName: string, locale: Locale): OpResult<{ userId: string }> {
	const name = displayName.trim();
	if (!isEmail(email) || !name || name.length > DISPLAY_NAME_MAX) return fail('invalid');
	if (findUserByEmail(db, email)) return fail('invalid');
	const userId = `user-${email.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
	db.users.push({ id: userId, displayName: name, email: email.trim().toLowerCase(), locale, globalRoles: [] });
	return ok({ userId });
}

/** Minimal wizard (round 4): name and measurement system; everything else starts from the defaults. */
export function createFamily(db: DemoDatabase, ctx: OperationContext, name: string, measurementSystem: MeasurementSystem): OpResult<{ familyId: string }> {
	if (ctx.offline) return fail('offline');
	if (!db.users.some((u) => u.id === ctx.userId)) return fail('forbidden');
	const trimmed = name.trim();
	if (!trimmed || trimmed.length > FAMILY_NAME_MAX || !['metric', 'uk_imperial'].includes(measurementSystem)) return fail('invalid');
	let familyId = `family-${trimmed.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'new'}`;
	for (let n = 2; db.families.some((f) => f.id === familyId); n++) familyId = `${familyId.replace(/-\d+$/, '')}-${n}`;
	db.families.push({
		id: familyId,
		name: trimmed,
		measurementSystem,
		timeZone: 'Europe/Rome',
		members: [{ userId: ctx.userId, role: 'family_admin', joinedAt: ctx.now }],
		bookIds: [],
		settings: defaultSettings(),
		createdAt: ctx.now,
		showSetupCard: true
	});
	return ok({ familyId });
}

/** The Wednesday job prepares next week at 20:00 (spec section 4). */
const JOB_WEEKDAY = 2;
const JOB_TIME = '20:00';

/** First generation (round 4): the meals still to come this week and, after the Wednesday job time, next week too. */
export function firstGenerationWeeks(now: string): IsoDate[] {
	const today = now.slice(0, 10);
	const monday = mondayOf(today);
	const jobAt = `${addDays(monday, JOB_WEEKDAY)}T${JOB_TIME}`;
	return now >= jobAt ? [monday, addDays(monday, 7)] : [monday];
}

export interface GenerationResult {
	weekStarts: IsoDate[];
	/** Slots left empty ("nessuna ricetta adatta"). */
	emptySlots: number;
}

/**
 * Simulated generation, declared in the interface: not the planner. Builds the slots from the diners
 * matrix and fixed meals, then fills each slot with the best suggestion that fits the settings (round 2
 * ranking), most constrained slots first; then tries to satisfy "at least one" rules on that day.
 */
export function generateFirstWeeks(db: DemoDatabase, ctx: OperationContext): OpResult<GenerationResult> {
	if (ctx.offline) return fail('offline');
	const family = familyFor(db, ctx);
	if (!family) return fail('forbidden');
	if (roleOf(family, ctx.userId) !== 'family_admin') return fail('forbidden');
	const starts = firstGenerationWeeks(ctx.now).filter((start) => !db.weeks.some((w) => w.familyId === family.id && w.startsOn === start));
	if (starts.length === 0) return fail('not_allowed');
	let emptySlots = 0;
	for (const startsOn of starts) emptySlots += planWeek(db, ctx, family, startsOn);
	return ok({ weekStarts: starts, emptySlots });
}

function planWeek(db: DemoDatabase, ctx: OperationContext, family: Family, startsOn: IsoDate): number {
	const draft: MealSlot[] = [];
	for (const date of weekDates(startsOn)) {
		for (const mealType of ['lunch', 'dinner'] as MealType[]) {
			const setting = slotSetting(family.settings, date, mealType);
			if (setting.servings === 0 || isMealPast(date, mealType, ctx.now)) continue;
			draft.push({ id: `${family.id}-${date}-${mealType}`, date, mealType, recipeId: null, freeText: setting.fixedText, servings: setting.servings, note: null, updatedBy: null, updatedAt: null });
		}
	}
	db.weeks.push({ id: `${family.id}-${startsOn}`, familyId: family.id, startsOn, generatedAt: ctx.now, slots: draft });
	// Read back what was stored: reactive state (the app store) keeps its own copy of pushed objects.
	const slots = db.weeks[db.weeks.length - 1].slots;

	const constraint = (s: MealSlot) => {
		const setting = slotSetting(family.settings, s.date, s.mealType);
		const weekday = weekdayOf(s.date);
		return (setting.maxMinutes !== null ? 2 : 0) + (family.settings.rules.some((r) => 'weekday' in r && r.weekday === weekday) ? 1 : 0);
	};
	const toFill = slots.filter((s) => s.freeText === null).sort((a, b) => constraint(b) - constraint(a) || a.id.localeCompare(b.id));
	for (const slot of toFill) slot.recipeId = rankCandidates(db, ctx, slot)[0]?.recipeId ?? null;

	for (const rule of family.settings.rules) {
		if (rule.kind !== 'at_least_one') continue;
		const day = slots.filter((s) => s.freeText === null && weekdayOf(s.date) === rule.weekday);
		const hasGroup = day.some((s) => s.recipeId && db.recipes.find((r) => r.id === s.recipeId)?.proteinGroup === rule.group);
		if (hasGroup) continue;
		for (const slot of day) {
			const candidate = rankCandidates(db, ctx, slot).find((c) => db.recipes.find((r) => r.id === c.recipeId)?.proteinGroup === rule.group);
			const recipe = candidate && db.recipes.find((r) => r.id === candidate.recipeId);
			if (recipe && fitsSettings(db, family, recipe, slot, slots)) {
				slot.recipeId = recipe.id;
				break;
			}
		}
	}
	return toFill.filter((s) => s.recipeId === null).length;
}
