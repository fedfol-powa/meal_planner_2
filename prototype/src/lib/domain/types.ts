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

/** Shopping list departments, in the standard order of spec section 6. */
export const DEPARTMENTS = [
	'produce', 'butcher', 'fish', 'chilled', 'bakery', 'pasta_grains', 'tinned', 'frozen', 'condiments', 'other'
] as const;
export type Department = (typeof DEPARTMENTS)[number];

export interface Ingredient {
	id: string;
	name: Translated;
	department: Department;
	/** Always at home (oil, salt, common spices): left out of shopping lists. */
	isPantry: boolean;
	/** Demo only: evident duplicate of the imported data, consolidated into this ingredient. */
	canonicalId: string | null;
}

export interface RecipeIngredient {
	ingredientId: string;
	quantity: Quantity;
	/** Quantity exactly as written in the source. */
	sourceText: string;
	/** Localised wording of a non-numeric quantity; required in both languages to publish. */
	text: Translated | null;
	isOptional: boolean;
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

/** "Non proporre più" (recipe_exclusions): the planner and suggestions skip the recipe for this family. */
export interface RecipeExclusion {
	familyId: string;
	recipeId: string;
	createdBy: string;
	createdAt: LocalDateTime;
}

/** family_ingredients: "avoid" keeps the ingredient out of shopping lists, reported apart. */
export interface FamilyIngredient {
	familyId: string;
	ingredientId: string;
	restriction: 'avoid' | 'limit';
}

/** The editable part of a slot, as stored in the change log. */
export type SlotContent = Pick<MealSlot, 'recipeId' | 'freeText' | 'servings' | 'note'>;

/** Append-only log of slot writes (meal_changes); the interface shows only the last change. */
export interface MealChange {
	id: string;
	slotId: string;
	actorId: string;
	channel: Channel;
	before: SlotContent;
	after: SlotContent;
	createdAt: LocalDateTime;
}

export interface DemoDatabase {
	users: User[];
	families: Family[];
	books: Book[];
	ingredients: Ingredient[];
	recipes: Recipe[];
	weeks: Week[];
	ratings: Rating[];
	exclusions: RecipeExclusion[];
	mealChanges: MealChange[];
	familyIngredients: FamilyIngredient[];
}
