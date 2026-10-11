import type { IsoDate } from '../../lib/calendar';

export function pickSelected(days: IsoDate[], requested?: IsoDate, opening?: IsoDate): IsoDate | null {
  if (requested && days.includes(requested)) return requested;
  if (opening && days.includes(opening)) return opening;
  return days[0] ?? null;
}

export function addMonths(month: string, delta: number): string {
  const d = new Date(`${month}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return d.toISOString().slice(0, 7);
}
