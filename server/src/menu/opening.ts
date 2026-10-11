import type { OpeningView } from '@app/contract';
import { mondayOf } from '@app/domain/planner';
import type { OperationContext } from '../pipeline.ts';
import { familyNow } from './time.ts';

/** Effective date of the opening: the client's today, else the family's local date at the request's instant. */
export async function effectiveDate(context: OperationContext, familyId: string, today: string | undefined): Promise<{ date: string; local: string }> {
	const { local } = await familyNow(context.tx, familyId, context.now);
	return { date: today ?? local.date, local: local.date };
}

/** Spec section 5.2: no weeks; first day from d with content; first day from d with a slot; last day with a slot before d; latest Monday. */
export async function openingOf(context: OperationContext, familyId: string, day: string): Promise<OpeningView> {
	const { tx } = context;
	const [latest] = await tx<{ startsOn: string }[]>`
		select starts_on::text as "startsOn" from app.weeks where family_id = ${familyId} order by starts_on desc limit 1`;
	if (!latest) return { kind: 'no_weeks' };
	const [found] = await tx<{ date: string }[]>`
		select s.date::text as date from app.meal_slots s join app.weeks w on w.id = s.week_id
		where w.family_id = ${familyId}
		order by
			s.date >= ${day} desc,
			case when s.date >= ${day} then s.recipe_id is not null or s.free_text is not null end desc,
			case when s.date >= ${day} then s.date end,
			s.date desc
		limit 1`;
	const date = found?.date ?? latest.startsOn;
	return { kind: 'day', date, weekStartsOn: mondayOf(date) };
}

/** Days of a month with at least one slot: the ones the calendar can select. */
export async function datesOf(context: OperationContext, familyId: string, month: string): Promise<string[]> {
	const first = `${month}-01`;
	const rows = await context.tx<{ date: string }[]>`
		select distinct s.date::text as date from app.meal_slots s join app.weeks w on w.id = s.week_id
		where w.family_id = ${familyId} and s.date >= ${first}::date and s.date < ${first}::date + interval '1 month'
		order by date`;
	return rows.map((r) => r.date);
}
