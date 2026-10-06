export const LOCALES = ['it-IT', 'en-GB'] as const;
export type Locale = (typeof LOCALES)[number];
export type MeasurementSystem = 'metric' | 'uk_imperial';
export type MealType = 'lunch' | 'dinner';
export type RecipeMealType = MealType | 'both';
export type SourceType = 'web' | 'youtube' | 'book' | 'home';
export type RecipeStatus = 'published' | 'draft';
export type ProteinGroup = 'fish' | 'white_meat' | 'meat' | 'legumes' | 'eggs' | 'vegetarian';
export type GlobalRole = 'recipe_curator' | 'app_admin';
export type FamilyRole = 'family_admin' | 'member';
export type Channel = 'web' | 'mcp';
/** Calendar date, YYYY-MM-DD. */
export type IsoDate = string;
/** Wall-clock time in the family's time zone, YYYY-MM-DDTHH:mm. Compared as strings. */
export type LocalDateTime = string;

/** Italian is always present; English may be missing only on draft recipes. */
export type Translated = { 'it-IT': string; 'en-GB': string | null };

export type UnitCode = 'g' | 'kg' | 'ml' | 'l' | 'oz' | 'piece' | 'clove' | 'tbsp' | 'tsp' | 'slice' | 'pinch';

export type Quantity =
	| { kind: 'amount'; value: number; unit: UnitCode }
	| { kind: 'to_taste' }
	| { kind: 'text' };

export interface Ingredient {
	id: string;
	name: Translated;
}

export interface RecipeIngredient {
	ingredientId: string;
	quantity: Quantity;
	/** Quantity exactly as written in the source. */
	sourceText: string;
	/** Localised wording of a non-numeric quantity; required in both languages to publish. */
	text: Translated | null;
}

export interface Book {
	id: string;
	title: string;
}

export interface Recipe {
	id: string;
	status: RecipeStatus;
	name: Translated;
	description: Translated;
	sourceType: SourceType;
	sourceUrl: string | null;
	bookId: string | null;
	bookPages: string | null;
	durationMinutes: number | null;
	baseServings: number | null;
	ingredients: RecipeIngredient[];
	mealType: RecipeMealType;
	proteinGroup: ProteinGroup | null;
	tags: string[];
	photo: string | null;
	/** Day the recipe entered the catalogue (created_at). */
	addedOn: IsoDate;
}

export interface User {
	id: string;
	displayName: string;
	locale: Locale;
	globalRoles: GlobalRole[];
}

export interface FamilyMember {
	userId: string;
	role: FamilyRole;
}

export interface Family {
	id: string;
	name: string;
	measurementSystem: MeasurementSystem;
	timeZone: string;
	members: FamilyMember[];
	bookIds: string[];
}

export interface MealSlot {
	id: string;
	date: IsoDate;
	mealType: MealType;
	recipeId: string | null;
	freeText: string | null;
	servings: number;
	note: string | null;
	cooked: boolean | null;
	/** null means the app (planner) wrote it. */
	updatedBy: string | null;
	updatedAt: LocalDateTime | null;
}

export interface Week {
	id: string;
	familyId: string;
	startsOn: IsoDate;
	generatedAt: LocalDateTime;
	slots: MealSlot[];
}

export interface Rating {
	userId: string;
	recipeId: string;
	stars: number;
}

export interface DemoDatabase {
	users: User[];
	families: Family[];
	books: Book[];
	ingredients: Ingredient[];
	recipes: Recipe[];
	weeks: Week[];
	ratings: Rating[];
}
