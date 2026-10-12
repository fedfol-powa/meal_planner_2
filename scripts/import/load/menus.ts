import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import { isMonday, isValidIsoDate } from '../family.ts';
import type { IsoDate, MealType } from '../../../domain/src/planner/index.ts';

// Weekly menus of the origin project (menu/<monday>/menu.yaml): the source of the "menu in corso"
// (detail spec, section 6). Only what the app keeps: recipe or free text, servings, note.
export interface OriginMenuSlot { date: IsoDate; mealType: MealType; originSlug: string | null; freeText: string | null; servings: number | null; note: string | null }
export interface OriginMenu { weekStart: IsoDate; slots: OriginMenuSlot[] }

type RawMeal = { ricetta?: string; libero?: string; porzioni?: number; note?: string } | null | undefined;
const MEALS: [string, MealType][] = [['pranzo', 'lunch'], ['cena', 'dinner']];

export function parseOriginMenu(text: string): OriginMenu {
	const raw = parse(text) as { settimana?: { inizio?: unknown }; giorni?: ({ data?: unknown } & Record<string, RawMeal>)[] };
	const weekStart = String(raw.settimana?.inizio ?? '');
	if (!isValidIsoDate(weekStart) || !isMonday(weekStart)) throw new Error(`Menu week does not start on a Monday: ${weekStart}`);
	const slots: OriginMenuSlot[] = [];
	for (const day of raw.giorni ?? []) {
		const date = String(day.data ?? '');
		if (!isValidIsoDate(date)) throw new Error(`Menu ${weekStart}: invalid day ${date}`);
		for (const [key, mealType] of MEALS) {
			const meal = day[key];
			if (!meal || (!meal.ricetta && !meal.libero)) continue;
			slots.push({
				date, mealType,
				originSlug: meal.ricetta ?? null,
				freeText: meal.ricetta ? null : (meal.libero ?? null),
				servings: meal.porzioni ?? null,
				note: meal.note ?? null,
			});
		}
	}
	return { weekStart, slots };
}

export function readOriginMenus(originDirectory: string): OriginMenu[] {
	const dir = resolve(originDirectory, 'menu');
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((name) => existsSync(resolve(dir, name, 'menu.yaml')))
		.sort()
		.map((name) => parseOriginMenu(readFileSync(resolve(dir, name, 'menu.yaml'), 'utf8')));
}
