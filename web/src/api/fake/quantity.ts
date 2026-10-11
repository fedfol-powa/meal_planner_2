import { translate, type Locale } from '../../i18n/translate';

// FAKE: linear scaling and metric only. The real scaling and conversion belong to W4 (domain/) and the server.
export type UnitCode =
  | 'g' | 'kg' | 'ml' | 'l' | 'oz' | 'us_cup' | 'tbsp' | 'tsp'
  | 'piece' | 'clove' | 'slice' | 'pinch' | 'sprig' | 'leaf' | 'bunch';
export type Quantity = { kind: 'amount'; value: number; unit: UnitCode } | { kind: 'to_taste' } | { kind: 'text' };
export type Translated = { 'it-IT': string; 'en-GB': string | null };

// [singular, plural]; an empty label means the number alone (pieces).
const UNIT_LABELS: Record<Locale, Record<UnitCode, [string, string]>> = {
  'it-IT': {
    g: ['g', 'g'], kg: ['kg', 'kg'], ml: ['ml', 'ml'], l: ['l', 'l'], oz: ['oz', 'oz'], us_cup: ['tazza USA', 'tazze USA'],
    piece: ['', ''], clove: ['spicchio', 'spicchi'], tbsp: ['cucchiaio', 'cucchiai'], tsp: ['cucchiaino', 'cucchiaini'],
    slice: ['fetta', 'fette'], pinch: ['pizzico', 'pizzichi'], sprig: ['rametto', 'rametti'], leaf: ['foglia', 'foglie'],
    bunch: ['mazzetto', 'mazzetti']
  },
  'en-GB': {
    g: ['g', 'g'], kg: ['kg', 'kg'], ml: ['ml', 'ml'], l: ['l', 'l'], oz: ['oz', 'oz'], us_cup: ['US cup', 'US cups'],
    piece: ['', ''], clove: ['clove', 'cloves'], tbsp: ['tbsp', 'tbsp'], tsp: ['tsp', 'tsp'],
    slice: ['slice', 'slices'], pinch: ['pinch', 'pinches'], sprig: ['sprig', 'sprigs'], leaf: ['leaf', 'leaves'],
    bunch: ['bunch', 'bunches']
  }
};
const COUNT_UNITS = new Set<UnitCode>(['piece', 'clove', 'slice', 'pinch', 'sprig', 'leaf', 'bunch']);
const FRACTION_UNITS = new Set<UnitCode>(['us_cup', 'tbsp', 'tsp', ...COUNT_UNITS]);
const FRACTIONS: Record<number, string> = { 25: '¼', 50: '½', 75: '¾' };

export function scaleQuantity(quantity: Quantity, factor: number): Quantity {
  return quantity.kind === 'amount' ? { ...quantity, value: quantity.value * factor } : quantity;
}

// Like the domain (option 1): at the source servings counts as written; once scaled cloves, pinches,
// sprigs, leaves, bunches and slices whole, pieces up to the next half.
const WHOLE_WHEN_SCALED = new Set<UnitCode>(['clove', 'pinch', 'sprig', 'leaf', 'bunch', 'slice']);

function round(value: number, unit: UnitCode, scaled: boolean): number {
  if (!scaled && COUNT_UNITS.has(unit)) return value;
  if (scaled && WHOLE_WHEN_SCALED.has(unit)) return Math.max(1, Math.ceil(value - 1e-9));
  if (scaled && unit === 'piece') return Math.max(0.5, Math.ceil(value * 2 - 1e-9) / 2);
  if (FRACTION_UNITS.has(unit)) return Math.max(0.25, Math.round(value * 4) / 4);
  return value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
}

export function formatAmount(quantity: Quantity, sourceText: string, text: Translated | null, locale: Locale, scaled = false): string {
  if (quantity.kind === 'to_taste') return translate(locale, 'quantity.toTaste');
  if (quantity.kind === 'text') return text?.[locale] ?? sourceText;
  const value = round(quantity.value, quantity.unit, scaled);
  const [singular, plural] = UNIT_LABELS[locale][quantity.unit];
  const fraction = FRACTION_UNITS.has(quantity.unit) ? FRACTIONS[Math.round((value % 1) * 100)] : undefined;
  const number = fraction !== undefined
    ? `${Math.floor(value) || ''}${fraction}`
    : new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
  const label = value <= 1 ? singular : plural;
  return label ? `${number} ${label}` : number;
}
