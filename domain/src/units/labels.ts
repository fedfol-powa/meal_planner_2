import type { UnitCode } from './codes.ts';
import type { Locale, Localized } from './locale.ts';

/** [singular, plural]; an empty label means the number alone (pieces). Shared by web, server and MCP. */
export const UNIT_LABELS: Record<Locale, Record<UnitCode, [string, string]>> = {
	'it-IT': {
		g: ['g', 'g'], kg: ['kg', 'kg'], oz: ['oz', 'oz'], lb: ['lb', 'lb'],
		ml: ['ml', 'ml'], l: ['l', 'l'], uk_fl_oz: ['fl oz', 'fl oz'], uk_pint: ['pinta', 'pinte'],
		tbsp: ['cucchiaio', 'cucchiai'], tsp: ['cucchiaino', 'cucchiaini'],
		piece: ['', ''], clove: ['spicchio', 'spicchi'], slice: ['fetta', 'fette'], pinch: ['pizzico', 'pizzichi'],
		sprig: ['rametto', 'rametti'], bunch: ['mazzetto', 'mazzetti'], leaf: ['foglia', 'foglie'],
		us_cup: ['tazza USA', 'tazze USA']
	},
	'en-GB': {
		g: ['g', 'g'], kg: ['kg', 'kg'], oz: ['oz', 'oz'], lb: ['lb', 'lb'],
		ml: ['ml', 'ml'], l: ['l', 'l'], uk_fl_oz: ['fl oz', 'fl oz'], uk_pint: ['pint', 'pints'],
		tbsp: ['tbsp', 'tbsp'], tsp: ['tsp', 'tsp'],
		piece: ['', ''], clove: ['clove', 'cloves'], slice: ['slice', 'slices'], pinch: ['pinch', 'pinches'],
		sprig: ['sprig', 'sprigs'], bunch: ['bunch', 'bunches'], leaf: ['leaf', 'leaves'],
		us_cup: ['US cup', 'US cups']
	}
};

export const TO_TASTE: Localized = { 'it-IT': 'q.b.', 'en-GB': 'to taste' };
