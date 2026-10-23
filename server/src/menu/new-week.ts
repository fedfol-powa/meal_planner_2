import type { Tx } from '../db.ts';
import { ensureWeeks } from './generation.ts';

/**
 * The week whose menu is ready and the caller has not seen (spec W24, sections 3 and 5.1).
 * Lazy generation first, under the family lock, as the other menu reads: the answer is never
 * null for a week this same read would have generated.
 */
export async function newWeekOf(tx: Tx, familyId: string, now: Date): Promise<string | null> {
	await ensureWeeks(tx, familyId, now);
	const [row] = await tx<{ week: string | null }[]>`select app.new_menu_week(${familyId}::uuid, ${now}::timestamptz)::text as week`;
	return row?.week ?? null;
}

/**
 * Only the new week is written, once (spec W24, section 5.1): any other week, or one already
 * seen, is accepted without writing, so the client cannot fill the table. No family counter moves.
 */
export async function markWeekSeen(tx: Tx, familyId: string, weekStartsOn: string, now: Date): Promise<void> {
	await tx`
		insert into app.menu_week_views (family_id, user_id, week_start)
		select ${familyId}::uuid, auth.uid(), ${weekStartsOn}::date
		where app.new_menu_week(${familyId}::uuid, ${now}::timestamptz) = ${weekStartsOn}::date
		on conflict do nothing`;
}
