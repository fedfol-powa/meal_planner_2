// Unit codes shared by recipe documents, shopping lists, the contract and MCP (spec section 6).

export const MASS_UNITS = ['g', 'kg', 'oz', 'lb'] as const;
export const VOLUME_UNITS = ['ml', 'l', 'uk_fl_oz', 'uk_pint'] as const;
/** Household spoons: never converted to millilitres, summed only with the same code. */
export const SPOON_UNITS = ['tbsp', 'tsp'] as const;
export const COUNT_UNITS = ['piece', 'clove', 'slice', 'pinch', 'sprig', 'bunch', 'leaf'] as const;
/** The US cup of American sources: allowed only in drafts, converted per ingredient before publishing. */
export const UNIT_CODES = [...MASS_UNITS, ...VOLUME_UNITS, ...SPOON_UNITS, ...COUNT_UNITS, 'us_cup'] as const;

export type UnitCode = (typeof UNIT_CODES)[number];
export type MassUnit = (typeof MASS_UNITS)[number];
export type VolumeUnit = (typeof VOLUME_UNITS)[number];
export type MeasuredUnit = MassUnit | VolumeUnit;
/** Units summed per code: spoons, counts and US cups. */
export type CountedUnit = Exclude<UnitCode, MeasuredUnit>;
export const COUNTED_UNITS = [...SPOON_UNITS, ...COUNT_UNITS, 'us_cup'] as const satisfies readonly CountedUnit[];

export type Dimension = 'mass' | 'volume' | 'spoon' | 'count' | 'us_cup';
export const UNIT_DIMENSION: Record<UnitCode, Dimension> = {
	g: 'mass', kg: 'mass', oz: 'mass', lb: 'mass',
	ml: 'volume', l: 'volume', uk_fl_oz: 'volume', uk_pint: 'volume',
	tbsp: 'spoon', tsp: 'spoon',
	piece: 'count', clove: 'count', slice: 'count', pinch: 'count', sprig: 'count', bunch: 'count', leaf: 'count',
	us_cup: 'us_cup'
};

export const DRAFT_ONLY_UNITS: ReadonlySet<UnitCode> = new Set<UnitCode>(['us_cup']);

// Weights and Measures Act 1985 (UK) and NIST (US cup).
export const G_PER_OZ = 28.349523125;
export const OZ_PER_LB = 16;
export const ML_PER_UK_FL_OZ = 28.4130625;
export const UK_FL_OZ_PER_PINT = 20;
export const ML_PER_US_CUP = 236.5882365;
/** UK measuring spoons, used only to present small volumes in UK imperial. */
export const ML_PER_UK_TSP = 5;
export const ML_PER_UK_TBSP = 15;

/** Grams per mass unit, millilitres per volume unit. */
export const BASE_FACTOR: Record<MeasuredUnit, number> = {
	g: 1,
	kg: 1000,
	oz: G_PER_OZ,
	lb: G_PER_OZ * OZ_PER_LB,
	ml: 1,
	l: 1000,
	uk_fl_oz: ML_PER_UK_FL_OZ,
	uk_pint: ML_PER_UK_FL_OZ * UK_FL_OZ_PER_PINT
};

export const isMassUnit = (unit: UnitCode): unit is MassUnit => UNIT_DIMENSION[unit] === 'mass';
export const isVolumeUnit = (unit: UnitCode): unit is VolumeUnit => UNIT_DIMENSION[unit] === 'volume';
