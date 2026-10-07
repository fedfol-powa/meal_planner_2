export const LOCALES = ['it-IT', 'en-GB'] as const;
export type Locale = (typeof LOCALES)[number];
export type MeasurementSystem = 'metric' | 'uk_imperial';
export type MealType = 'lunch' | 'dinner';
export type RecipeMealType = MealType | 'both';
export type SourceType = 'web' | 'youtube' | 'book' | 'home';
/** archived (round 5): out of the catalogue and suggestions, still readable from meals; reversible. */
export type RecipeStatus = 'published' | 'draft' | 'archived';
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

/** us_cup: the US cup of American sources, a volume (236.6 ml), never confused with UK measures. */
export type UnitCode = 'g' | 'kg' | 'ml' | 'l' | 'oz' | 'us_cup' | 'piece' | 'clove' | 'tbsp' | 'tsp' | 'slice' | 'pinch';

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
	/** How it is bought, when it differs from how recipes measure it: `from` amounts become pieces in shopping lists. */
	purchase: { from: UnitCode; piecesPer: number; source: string } | null;
}

export interface RecipeIngredient {
	ingredientId: string;
	quantity: Quantity;
	/** Quantity exactly as written in the source. */
	sourceText: string;
	/** Localised wording of a non-numeric quantity; required in both languages to publish. */
	text: Translated | null;
	/** Variety as free text ("Roma", "gialla senza semi"), in both languages to publish (round 5). */
	variety: Translated | null;
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
	createdBy: string;
	/** Current published version; 0 for a recipe never published (draft). */
	version: number;
	archivedBy: string | null;
	archivedAt: LocalDateTime | null;
}

/** What curators edit and versions keep (round 5); photo, tags and dates stay on the recipe. */
export const RECIPE_CONTENT_FIELDS = [
	'name', 'description', 'sourceType', 'sourceUrl', 'bookId', 'bookPages', 'durationMinutes', 'baseServings', 'mealType', 'proteinGroup', 'ingredients'
] as const;
export type RecipeContentField = (typeof RECIPE_CONTENT_FIELDS)[number];
export type RecipeContent = Pick<Recipe, RecipeContentField>;

/** recipe_versions: append-only history of published contents (spec section 8, review R1). */
export interface RecipeVersion {
	recipeId: string;
	version: number;
	content: RecipeContent;
	publishedBy: string;
	publishedAt: LocalDateTime;
	/** Set when the version republishes an older one. */
	restoredFrom: number | null;
}

/** One save of a draft; overwritten saves stay here, recoverable (round 5, conflicts). */
export interface DraftRevision {
	revision: number;
	content: RecipeContent;
	savedBy: string;
	savedAt: LocalDateTime;
}

/**
 * recipe_drafts: shared by every curator. "new" belongs to a recipe never published (status draft, which
 * past meals may cite); "revision" works on a published recipe without exposing it to families.
 */
export interface RecipeDraft {
	id: string;
	recipeId: string;
	kind: 'new' | 'revision';
	/** Published version the revision started from; null for a new recipe. */
	baseVersion: number | null;
	content: RecipeContent;
	createdBy: string;
	createdAt: LocalDateTime;
	updatedBy: string;
	updatedAt: LocalDateTime;
	/** Grows at every save: a save based on an older revision is a conflict. */
	revision: number;
	/** Revision that passed the full check; publishing needs it equal to revision. */
	verifiedRevision: number | null;
	history: DraftRevision[];
}

export interface User {
	id: string;
	displayName: string;
	email: string;
	locale: Locale;
	globalRoles: GlobalRole[];
}

export interface FamilyMember {
	userId: string;
	role: FamilyRole;
	joinedAt: LocalDateTime;
}

/** One meal of the weekly pattern: servings (0 = not planned), a fixed free meal, a time limit. */
export interface SlotSetting {
	servings: number;
	/** Fixed free meal ("Pizza", "Cena libera"): never planned with a recipe. */
	fixedText: string | null;
	maxMinutes: number | null;
}

/** Kinds of dish a rule can name, from the recipe tags. */
export const DISH_KINDS = ['pasta', 'rice', 'bread_wrap', 'skottle'] as const;
export type DishKind = (typeof DISH_KINDS)[number];

/** Meal rules from templates (round 4): no free-text rules. Weekday 0 = Monday. */
export type MealRule =
	| { id: string; kind: 'only_lunch'; dish: DishKind }
	| { id: string; kind: 'at_least_one'; group: ProteinGroup; weekday: number }
	| { id: string; kind: 'never_on'; group: ProteinGroup; weekday: number };

/** Weekly food groups of spec section 3, with the CREA-based ranges as defaults. */
export const FOOD_GROUPS = ['fish', 'legumes', 'white_meat', 'red_meat', 'cured_meat', 'eggs', 'cheese', 'potatoes', 'heavy'] as const;
export type FoodGroup = (typeof FOOD_GROUPS)[number];
export type GroupRange = { min: number; max: number };

/** families.settings without the score weights, which stay out of the interface (round 4). */
export interface FamilySettings {
	/** Seven entries per meal, Monday first. */
	slots: Record<MealType, SlotSetting[]>;
	rules: MealRule[];
	knownNew: { known: number; new: number; tolerance: number };
	groupRanges: Record<FoodGroup, GroupRange>;
}

export interface Family {
	id: string;
	name: string;
	measurementSystem: MeasurementSystem;
	timeZone: string;
	members: FamilyMember[];
	bookIds: string[];
	settings: FamilySettings;
	createdAt: LocalDateTime;
	/** Card in the menu after the first generation ("Invita la famiglia", "Sistema le impostazioni"). */
	showSetupCard: boolean;
}

/** family_invitations: a link reusable until it expires (7 days) or is revoked. */
export interface FamilyInvitation {
	token: string;
	familyId: string;
	createdBy: string;
	createdAt: LocalDateTime;
	expiresAt: LocalDateTime;
	revokedAt: LocalDateTime | null;
}

/** A removal: links created before it no longer let that person back in (review R2, round 4). */
export interface FamilyRemoval {
	familyId: string;
	userId: string;
	removedBy: string;
	removedAt: LocalDateTime;
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
	/** Only for "limit": at most this many meals a week. */
	weeklyMax: number | null;
}

/** Quantities of one ingredient summed per dimension: masses in g, volumes in ml, counts per unit. */
export interface CombinedQuantity {
	amounts: { value: number; unit: UnitCode }[];
	/** Non-numeric quantities, kept as written (deduplicated). */
	texts: string[];
	toTaste: boolean;
}

/** What a shopping list needs from a slot; a closed list keeps a copy (frozen). */
export type ShoppingListSlot = Pick<MealSlot, 'id' | 'date' | 'mealType' | 'recipeId' | 'servings'>;

/** A ticked item ("already have it" or "bought"), with the quantity it had when ticked. */
export interface ShoppingCheck {
	ingredientId: string;
	quantity: CombinedQuantity;
	by: string;
	at: LocalDateTime;
}

export interface ShoppingManualItem {
	id: string;
	text: string;
	checked: boolean;
	createdBy: string;
	createdAt: LocalDateTime;
}

/**
 * The shopping list of a week (round 3, third revision): one per week, with every meal of the week,
 * shared by the family. Saved at the first change; quantities always follow the meals.
 */
export interface ShoppingList {
	familyId: string;
	weekId: string;
	checks: ShoppingCheck[];
	/** Pantry or avoided ingredients put back on the list. */
	addedBack: string[];
	manualItems: ShoppingManualItem[];
	updatedBy: string;
	updatedAt: LocalDateTime;
	/** Offline changes kept on the device since this time, sent when back online (round 3). */
	pendingSince: LocalDateTime | null;
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
	shoppingLists: ShoppingList[];
	invitations: FamilyInvitation[];
	removals: FamilyRemoval[];
	recipeVersions: RecipeVersion[];
	recipeDrafts: RecipeDraft[];
}
