import { daysBetween } from '@app/domain/planner';
import { appError } from '../errors.ts';
import { fresh, type Implementer, type Prepare } from '../pipeline.ts';
import { ensureWeeks } from './generation.ts';
import { datesOf, effectiveDate, openingOf } from './opening.ts';

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
	'menu.getWeek': lazy,
	'menu.getDates': lazy,
};

export function menuRouter(os: Implementer) {
	return {
		getOpening: os.menu.getOpening.handler(async ({ context, input }) => {
			const { date } = await effectiveDate(context, input.familyId, input.today);
			return fresh(context, await openingOf(context, input.familyId, date));
		}),
		getDates: os.menu.getDates.handler(async ({ context, input }) => fresh(context, await datesOf(context, input.familyId, input.month))),
		// Replaced by the week view (task 11 of the plan).
		getWeek: os.menu.getWeek.handler(() => {
			throw appError('not_found');
		}),
	};
}
