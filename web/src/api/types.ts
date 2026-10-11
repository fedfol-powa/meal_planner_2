import type { Locale } from '../i18n/translate';
import type { IsoDate, LocalDateTime, MealType } from '../lib/calendar';

export type RecipeMealType = MealType | 'both';
export type SourceType = 'web' | 'youtube' | 'book' | 'home';
export type ProteinGroup = 'fish' | 'white_meat' | 'meat' | 'legumes' | 'eggs' | 'vegetarian';
export type FamilyRole = 'family_admin' | 'member';

export interface RatingSummary { familyAverage: number | null; familyCount: number; myStars: number | null }
export interface RecipeSummary {
  id: string; name: string; description: string; photo: string | null; durationMinutes: number | null;
  sourceType: SourceType; sourceUrl: string | null; bookTitle: string | null; bookPages: string | null;
  mealType: RecipeMealType; proteinGroup: ProteinGroup | null;
}
/** Quantity already scaled, converted and written in the user's language (spec section 1, ready views). */
export interface IngredientLine { ingredientId: string; name: string; amount: string; optional: boolean }
export interface MealView {
  slotId: string; date: IsoDate; mealType: MealType; kind: 'recipe' | 'free' | 'empty';
  recipe: RecipeSummary | null; freeText: string | null; servings: number;
  /** null when the recipe has no verified ingredients yet. */
  ingredients: IngredientLine[] | null; note: string | null;
  /** null when the recipe cannot be rated or opened by this user (e.g. a draft). */
  rating: RatingSummary | null; canOpenRecipe: boolean;
  /** userName null: the author is no longer a member. */
  lastChange: { userName: string | null; at: LocalDateTime } | null;
}
export interface DayView { date: IsoDate; meals: MealView[] }
export interface WeekView { startsOn: IsoDate; days: DayView[] }
export type OpeningView = { kind: 'no_weeks' } | { kind: 'day'; date: IsoDate; weekStartsOn: IsoDate };
export type RecipeSort = 'name' | 'rating' | 'added' | 'lastEaten';
export interface RecipeQuery {
  text?: string; mealType?: MealType; maxMinutes?: number; proteinGroup?: ProteinGroup; minStars?: number;
  sort?: RecipeSort; reversed?: boolean;
}
export interface RecipeListItem { recipe: RecipeSummary; rating: RatingSummary; servings: number; ingredients: IngredientLine[] }
export interface RecipeDetailView {
  recipe: RecipeSummary; baseServings: number | null; servings: number; ingredients: IngredientLine[];
  rating: RatingSummary; history: { date: IsoDate; mealType: MealType }[];
}
export interface FamilyView { id: string; name: string; timeZone: string; role: FamilyRole }
export interface MeView {
  user: { id: string; displayName: string; email: string; locale: Locale };
  families: FamilyView[]; currentFamilyId: string | null;
}

/** «Invariato» in the contract (decided by W1). The version is an opaque string: kept and sent back, never parsed. */
export type Read<T> = { unchanged: true; version: string } | { unchanged: false; version: string; data: T };
export interface ReadInput { knownVersion?: string }
export interface FamilyInput extends ReadInput { familyId: string }

/** Same shape as the future oRPC client (nested by area). Names align with wave 2's contract. */
export interface Api {
  me: { get(input: ReadInput): Promise<Read<MeView>> };
  menu: {
    getOpening(input: FamilyInput): Promise<Read<OpeningView>>;
    getWeek(input: FamilyInput & { weekStartsOn: IsoDate }): Promise<Read<WeekView>>;
    /** Days with a menu in a month (YYYY-MM), for the date picker. */
    getDates(input: FamilyInput & { month: string }): Promise<Read<IsoDate[]>>;
  };
  recipes: {
    search(input: FamilyInput & { query: RecipeQuery }): Promise<Read<RecipeListItem[]>>;
    /** slotId: opened from that meal; wave 2 shows the version it was eaten with (spec R1). */
    get(input: FamilyInput & { recipeId: string; servings?: number; slotId?: string }): Promise<Read<RecipeDetailView>>;
  };
  ratings: { set(input: { familyId: string; recipeId: string; stars: number | null }): Promise<RatingSummary> };
}

export const PROTEIN_GROUPS = ['fish', 'white_meat', 'meat', 'legumes', 'eggs', 'vegetarian'] as const satisfies readonly ProteinGroup[];
