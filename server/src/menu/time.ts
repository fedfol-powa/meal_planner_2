import { localDateTime, type LocalDateTime } from '@app/domain/planner';
import type { Tx } from '../db.ts';
import { logEvent } from '../log.ts';

export const FALLBACK_TIME_ZONE = 'Europe/Rome';

/** Local date and time in a family's zone; an unreadable zone falls back to Rome with a log line. */
export function localIn(familyId: string, timeZone: string, now: Date): LocalDateTime {
	try {
		return localDateTime(now, timeZone);
	} catch {
		logEvent('invalid_time_zone', { familyId }, 'error');
		return localDateTime(now, FALLBACK_TIME_ZONE);
	}
}

export async function familyNow(tx: Tx, familyId: string, now: Date): Promise<{ timeZone: string; local: LocalDateTime }> {
	const [family] = await tx<{ timeZone: string }[]>`select time_zone as "timeZone" from app.families where id = ${familyId}`;
	const timeZone = family?.timeZone ?? FALLBACK_TIME_ZONE;
	return { timeZone, local: localIn(familyId, timeZone, now) };
}
