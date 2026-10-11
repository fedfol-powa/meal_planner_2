import type { IsoDate } from '../../lib/calendar';

// The day shown in the menu survives a trip to another view (design.md, navigation).
let lastDay: IsoDate | undefined;

export function rememberMenuDay(day: IsoDate | undefined): void {
  lastDay = day;
}

export function rememberedMenuDay(): IsoDate | undefined {
  return lastDay;
}
