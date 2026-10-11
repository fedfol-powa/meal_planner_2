import { z } from 'zod';
import type { Locale } from '../units/locale.ts';

/** Shop departments in the standard order of spec section 6; `ingredients.department` uses these codes. */
export const DEPARTMENTS = ['produce', 'butcher', 'fish', 'chilled', 'bakery', 'pasta_grains', 'tinned', 'frozen', 'condiments', 'other'] as const;
export type Department = (typeof DEPARTMENTS)[number];
export const departmentSchema = z.enum(DEPARTMENTS);

export const DEPARTMENT_LABELS: Record<Locale, Record<Department, string>> = {
	'it-IT': {
		produce: 'Frutta e verdura', butcher: 'Macelleria', fish: 'Pescheria', chilled: 'Banco frigo e latticini',
		bakery: 'Pane e prodotti da forno', pasta_grains: 'Pasta, riso e cereali', tinned: 'Scatolame e conserve',
		frozen: 'Surgelati', condiments: 'Condimenti e dispensa', other: 'Altro'
	},
	'en-GB': {
		produce: 'Fruit and veg', butcher: 'Butcher', fish: 'Fishmonger', chilled: 'Chilled and dairy',
		bakery: 'Bread and bakery', pasta_grains: 'Pasta, rice and grains', tinned: 'Tins and jars',
		frozen: 'Frozen', condiments: 'Condiments and store cupboard', other: 'Other'
	}
};
