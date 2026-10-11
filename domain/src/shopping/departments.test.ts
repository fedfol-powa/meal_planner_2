import { describe, expect, it } from 'vitest';
import { LOCALES } from '../units/locale.ts';
import { DEPARTMENTS, DEPARTMENT_LABELS, departmentSchema } from './departments.ts';

describe('departments', () => {
	it('keeps the standard shopping order (spec section 6)', () => {
		expect(DEPARTMENTS).toEqual(['produce', 'butcher', 'fish', 'chilled', 'bakery', 'pasta_grains', 'tinned', 'frozen', 'condiments', 'other']);
	});
	it('labels every department in both languages', () => {
		for (const locale of LOCALES) for (const d of DEPARTMENTS) expect(DEPARTMENT_LABELS[locale][d]).not.toBe('');
		expect(DEPARTMENT_LABELS['it-IT'].produce).toBe('Frutta e verdura');
		expect(DEPARTMENT_LABELS['en-GB'].tinned).toBe('Tins and jars');
	});
	it('validates codes', () => {
		expect(departmentSchema.safeParse('fish').success).toBe(true);
		expect(departmentSchema.safeParse('pescheria').success).toBe(false);
	});
});
