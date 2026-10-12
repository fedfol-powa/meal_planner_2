import { describe, expect, it } from 'vitest';
import { parseOriginMenu } from './menus.ts';

const MENU = `
settimana: {inizio: 2026-10-12, fine: 2026-10-18}
giorni:
  - giorno: lun
    data: 2026-10-12
    pranzo: {ricetta: fusilli-ricotta, porzioni: 2, note: "x2"}
    cena: {ricetta: piadine, porzioni: 2}
  - giorno: dom
    data: 2026-10-18
    pranzo: {libero: Pizza da asporto}
`;

describe('parseOriginMenu', () => {
	it('reads recipes, servings, free text and notes', () => {
		const menu = parseOriginMenu(MENU);
		expect(menu.weekStart).toBe('2026-10-12');
		expect(menu.slots).toEqual([
			{ date: '2026-10-12', mealType: 'lunch', originSlug: 'fusilli-ricotta', freeText: null, servings: 2, note: 'x2' },
			{ date: '2026-10-12', mealType: 'dinner', originSlug: 'piadine', freeText: null, servings: 2, note: null },
			{ date: '2026-10-18', mealType: 'lunch', originSlug: null, freeText: 'Pizza da asporto', servings: null, note: null },
		]);
	});
	it('refuses a week that does not start on Monday', () => {
		expect(() => parseOriginMenu(MENU.replace('inizio: 2026-10-12', 'inizio: 2026-10-13'))).toThrow(/Monday/);
	});
});
