import { daysBetween } from '@app/domain/planner';
import { appError } from '../errors.ts';
import { fresh, type Implementer, type Prepare } from '../pipeline.ts';
import { ensureWeeks } from './generation.ts';
import { markWeekSeen, newWeekOf } from './new-week.ts';
import { datesOf, effectiveDate, openingOf } from './opening.ts';
import { mealPassedCount } from './versions.ts';
import { weekViewOf } from './week-view.ts';

const familyOf = (input: unknown) => (input as { familyId: string }).familyId;
/** Lazy generation before the version (spec section 4.4): the answer already shows the new weeks. */
const lazy: Prepare = async (context, input) => {
	await ensureWeeks(context.tx, familyOf(input), context.now);
};

export const menuPrepare: Record<string, Prepare> = {
	/** Validates today and puts the effective date in the version, before the unchanged answer (spec 5.1). */
	'menu.getOpening': async (context, input) => {
		const { familyId, today } = input as { familyId: string; today?: string };
		const { date, local } = await effectiveDate(context, familyId, today);
		if (today && Math.abs(daysBetween(local, today)) > 1) {
			throw appError('invalid', { issues: [{ path: ['today'], code: 'out_of_range' }] });
		}
		await ensureWeeks(context.tx, familyId, context.now);
		return { versionPart: `d${date}` };
	},
	/** The meals already past at the request's instant enter the version: R1 changes when a meal passes (spec 5.3). */
	'menu.getWeek': async (context, input) => {
		const { familyId, weekStartsOn } = input as { familyId: string; weekStartsOn: string };
		await ensureWeeks(context.tx, familyId, context.now);
		const [week] = await context.tx<{ id: string }[]>`select id from app.weeks where family_id = ${familyId} and starts_on = ${weekStartsOn}`;
		if (week) return { versionPart: `p${await mealPassedCount(context.tx, familyId, week.id, context.now)}` };
	},
	'menu.getDates': lazy,
};

export function menuRouter(os: Implementer) {
	return {
		getOpening: os.menu.getOpening.handler(async ({ context, input }) => {
			const { date } = await effectiveDate(context, input.familyId, input.today);
			return fresh(context, await openingOf(context, input.familyId, date));
		}),
		getDates: os.menu.getDates.handler(async ({ context, input }) => fresh(context, await datesOf(context, input.familyId, input.month))),
		getWeek: os.menu.getWeek.handler(async ({ context, input }) => fresh(context, await weekViewOf(context, input.familyId, input.weekStartsOn))),
		/** Personal, not versioned (spec W24, section 5.1). */
		getNewWeek: os.menu.getNewWeek.handler(async ({ context, input }) => ({ weekStartsOn: await newWeekOf(context.tx, input.familyId, context.now) })),
		markWeekSeen: os.menu.markWeekSeen.handler(async ({ context, input }) => {
			await markWeekSeen(context.tx, input.familyId, input.weekStartsOn, context.now);
			return { ok: true as const };
		}),
	};
}
