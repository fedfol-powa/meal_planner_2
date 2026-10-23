import { addDays, isWeekVisible, mondayOf } from '#lib/domain/calendar.ts';
import type { DemoDatabase, IsoDate } from '#lib/domain/types.ts';
import type { OperationContext } from '#lib/operations/context.ts';

/**
 * W24 (avviso del menu pronto): the weeks each person has already seen, behind the dot on the calendar
 * icon. Kept outside the persisted demo state (its own key), so STORAGE_KEY does not change; in the app
 * "seen" lives on the server, per person.
 */
const SEEN_KEY = 'app-famiglia-prototype-w24-seen';

function read<T>(key: string, fallback: T): T {
	try {
		const raw = localStorage.getItem(key);
		return raw === null ? fallback : (JSON.parse(raw) as T);
	} catch {
		return fallback;
	}
}

function write(key: string, value: unknown) {
	try {
		localStorage.setItem(key, JSON.stringify(value));
	} catch {
		// Private mode: the prototype keeps working in memory.
	}
}

class NewWeekNotice {
	seen = $state<string[]>(typeof localStorage === 'undefined' ? [] : read<string[]>(SEEN_KEY, []));

	/** Monday of the next week when it is ready and this person has not looked at it yet; it expires on that Monday. */
	pendingWeek(db: DemoDatabase, ctx: OperationContext): IsoDate | null {
		const next = addDays(mondayOf(ctx.now.slice(0, 10)), 7);
		const week = db.weeks.find((w) => w.familyId === ctx.familyId && w.startsOn === next);
		if (!week || !isWeekVisible(week, ctx.now)) return null;
		return this.seen.includes(`${ctx.userId}:${ctx.familyId}:${next}`) ? null : next;
	}

	/** Any day of the new week shown in the Menu (tap, swipe or calendar) counts as seen. */
	markSeen(ctx: OperationContext, startsOn: IsoDate) {
		const key = `${ctx.userId}:${ctx.familyId}:${startsOn}`;
		if (this.seen.includes(key)) return;
		this.seen = [...this.seen, key];
		write(SEEN_KEY, this.seen);
	}

	reset() {
		this.seen = [];
		write(SEEN_KEY, []);
	}
}

export const newWeekNotice = new NewWeekNotice();
